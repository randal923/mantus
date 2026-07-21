import type { CharacterVocation } from "@tibia/protocol";
import type { Pool } from "pg";
import { getPotionDefinition } from "../potion/getPotionDefinition";
import { getVocation } from "../progression/getVocation";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemMutation } from "./ItemMutation";
import type { ItemRow } from "./ItemRow";
import { itemFromRow } from "./itemFromRow";
import type { PgItemAudit } from "./PgItemAudit";
import type { PgItemGuards } from "./PgItemGuards";
import type { PgItemLocks } from "./PgItemLocks";
import type { PotionUseRequest } from "./PotionUseRequest";
import type { PotionUseResult } from "./PotionUseResult";
import { requireReturnedItem } from "./requireReturnedItem";
import { requireVersion } from "./requireVersion";
import { decrementItemCountUpdate } from "./sql/decrementItemCountUpdate";
import { deleteItemById } from "./sql/deleteItemById";
import { incrementPotionFlaskUpdate } from "./sql/incrementPotionFlaskUpdate";
import { insertPotionFlask } from "./sql/insertPotionFlask";
import { insertItemWrittenAudit } from "./sql/insertItemWrittenAudit";
import { lockPotionCharactersQuery } from "./sql/lockPotionCharactersQuery";
import { potionFlaskTransformUpdate } from "./sql/potionFlaskTransformUpdate";
import { restorePotionTargetQuery } from "./sql/restorePotionTargetQuery";
import { writeTextUpdate } from "./sql/writeTextUpdate";
import { withSerializableTransaction } from "./withSerializableTransaction";

interface PotionCharacterRow {
  readonly id: string;
  readonly level: number;
  readonly vocation: CharacterVocation;
  readonly progression_definition_version: number;
  readonly version: number;
  readonly health: number;
  readonly mana: number;
}

interface RestoredPotionTargetRow {
  readonly version: number;
  readonly health: number;
  readonly mana: number;
}

export class PgItemUseOps {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly locks: PgItemLocks,
    private readonly guards: PgItemGuards,
    private readonly audit: PgItemAudit,
  ) {}

  writeText(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    text: string,
  ): Promise<ItemMutation> {
    return withSerializableTransaction(this.pool, async (client) => {
      await this.locks.lockCharacter(client, characterId);
      const row = await this.locks.lockItem(client, itemId);
      requireVersion(row, expectedVersion);
      await this.guards.requireOwned(client, row.id, characterId);
      const type = this.catalog.require(row.item_type_id);
      if (!type.text?.writeable) throw new Error("item is not writeable");
      const before = itemFromRow(row);
      if (
        text.length > type.text.maxLength ||
        Buffer.byteLength(JSON.stringify({ ...before.attributes, text })) >
          4_096
      ) {
        throw new Error("item text is too long");
      }
      const result = await client.query<ItemRow>(writeTextUpdate, [
        row.id,
        text,
      ]);
      const after = requireReturnedItem(result.rows[0]);
      await client.query(insertItemWrittenAudit, [
        characterId,
        row.id,
        typeof before.attributes.text === "string"
          ? before.attributes.text.length
          : 0,
        text.length,
      ]);
      return { before, after: [after] };
    });
  }

  consume(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    count: number,
    reason: "rune" | "ammunition" | "break" | "food",
  ): Promise<ItemMutation> {
    return withSerializableTransaction(this.pool, async (client) => {
      await this.locks.lockCharacter(client, characterId);
      const row = await this.locks.lockItem(client, itemId);
      requireVersion(row, expectedVersion);
      await this.guards.requireOwned(client, row.id, characterId);
      if (!Number.isInteger(count) || count < 1 || count > row.count) {
        throw new Error("invalid consume count");
      }
      const before = itemFromRow(row);
      if (count === row.count) {
        await client.query(deleteItemById, [row.id]);
        await this.audit.destruction(
          client,
          characterId,
          before,
          count,
          reason,
        );
        return { before, after: [], removedItemIds: [row.id] };
      }
      const result = await client.query<ItemRow>(decrementItemCountUpdate, [
        row.id,
        count,
      ]);
      const after = requireReturnedItem(result.rows[0]);
      await this.audit.destruction(
        client,
        characterId,
        before,
        count,
        reason,
      );
      return { before, after: [after] };
    });
  }

  usePotion(request: PotionUseRequest): Promise<PotionUseResult> {
    return withSerializableTransaction(this.pool, async (client) => {
      const characterIds = [
        ...new Set([
          request.actorCharacterId,
          request.targetCharacterId,
        ]),
      ].sort();
      const characters = await client.query<PotionCharacterRow>(
        lockPotionCharactersQuery,
        [characterIds],
      );
      if (characters.rows.length !== characterIds.length) {
        throw new Error("potion character is missing");
      }
      const actor = characters.rows.find(
        (row) => row.id === request.actorCharacterId,
      );
      const target = characters.rows.find(
        (row) => row.id === request.targetCharacterId,
      );
      if (!actor || !target) throw new Error("potion character is missing");
      if (
        target.version !== request.expectedTargetCharacterVersion ||
        target.health !== request.expectedTargetHealth ||
        target.mana !== request.expectedTargetMana ||
        target.health <= 0 ||
        !Number.isInteger(request.targetMaxHealth) ||
        request.targetMaxHealth < target.health ||
        !Number.isInteger(request.targetMaxMana) ||
        request.targetMaxMana < target.mana
      ) {
        throw new Error("potion target state is stale");
      }

      const plan = request.itemPlan;
      const row = await this.locks.lockItem(client, plan.before.id);
      requireVersion(row, plan.before.version);
      await this.guards.requireOwned(client, row.id, request.actorCharacterId);
      this.requirePlannedItem(itemFromRow(row), plan.before, "potion source");
      const potion = getPotionDefinition(row.item_type_id);
      if (!potion) throw new Error("item is not a restorative potion");
      this.requirePotionRestore(request.healthRestore, potion.health);
      this.requirePotionRestore(request.manaRestore, potion.mana);
      const baseVocation = getVocation(
        actor.vocation,
        actor.progression_definition_version,
      ).baseVocation;
      if (potion.level && actor.level < potion.level) {
        throw new Error("potion level requirement is not met");
      }
      if (potion.vocations && !potion.vocations.includes(baseVocation)) {
        throw new Error("potion vocation requirement is not met");
      }

      const restored = await client.query<RestoredPotionTargetRow>(
        restorePotionTargetQuery,
        [
          target.id,
          request.expectedTargetCharacterVersion,
          request.targetMaxHealth,
          request.healthRestore,
          request.targetMaxMana,
          request.manaRestore,
          request.expectedTargetHealth,
          request.expectedTargetMana,
        ],
      );
      const restoredTarget = restored.rows[0];
      if (
        !restoredTarget ||
        restoredTarget.version !== request.expectedTargetCharacterVersion + 1
      ) {
        throw new Error("potion target changed during use");
      }

      let createdFlask: Item;
      if (plan.kind === "transform") {
        if (row.count !== 1) {
          throw new Error("potion transform plan does not consume one item");
        }
        const transformed = await client.query<ItemRow>(
          potionFlaskTransformUpdate,
          [row.id, potion.flaskTypeId],
        );
        createdFlask = requireReturnedItem(transformed.rows[0]);
        this.requirePlannedItem(
          createdFlask,
          plan.flaskAfter,
          "transformed potion flask",
        );
      } else {
        if (row.count <= 1) {
          throw new Error("potion decrement plan requires a stack");
        }
        const remaining = await client.query<ItemRow>(
          decrementItemCountUpdate,
          [row.id, 1],
        );
        this.requirePlannedItem(
          requireReturnedItem(remaining.rows[0]),
          plan.potionAfter,
          "remaining potion stack",
        );
        const flaskType = this.catalog.require(potion.flaskTypeId);
        if (plan.kind === "merge") {
          if (plan.flaskBefore.typeId !== potion.flaskTypeId) {
            throw new Error("potion flask merge type is invalid");
          }
          const flaskRow = await this.locks.lockItem(
            client,
            plan.flaskBefore.id,
          );
          requireVersion(flaskRow, plan.flaskBefore.version);
          await this.guards.requireOwned(
            client,
            flaskRow.id,
            request.actorCharacterId,
          );
          this.requirePlannedItem(
            itemFromRow(flaskRow),
            plan.flaskBefore,
            "existing potion flask",
          );
          const incremented = await client.query<ItemRow>(
            incrementPotionFlaskUpdate,
            [flaskRow.id, flaskType.maxCount],
          );
          createdFlask = requireReturnedItem(incremented.rows[0]);
          this.requirePlannedItem(
            createdFlask,
            plan.flaskAfter,
            "merged potion flask",
          );
        } else {
          if (
            plan.flaskAfter.typeId !== potion.flaskTypeId ||
            plan.flaskAfter.location.kind !== "inventory" ||
            plan.flaskAfter.location.characterId !== request.actorCharacterId
          ) {
            throw new Error("created potion flask location is invalid");
          }
          const inserted = await client.query<ItemRow>(insertPotionFlask, [
            plan.flaskAfter.id,
            potion.flaskTypeId,
            request.actorCharacterId,
            plan.flaskAfter.location.slot,
          ]);
          createdFlask = requireReturnedItem(inserted.rows[0]);
          this.requirePlannedItem(
            createdFlask,
            plan.flaskAfter,
            "created potion flask",
          );
        }
      }

      await this.audit.destruction(
        client,
        request.actorCharacterId,
        plan.before,
        1,
        "potion",
      );
      await this.audit.creation(
        client,
        request.actorCharacterId,
        { ...createdFlask, count: 1 },
        "potion-flask",
      );
      return {
        targetCharacterVersion: restoredTarget.version,
        healthRestored: restoredTarget.health - target.health,
        manaRestored: restoredTarget.mana - target.mana,
      };
    });
  }

  private requirePotionRestore(
    amount: number,
    range: readonly [number, number] | undefined,
  ): void {
    if (
      !Number.isInteger(amount) ||
      (range ? amount < range[0] || amount > range[1] : amount !== 0)
    ) {
      throw new Error("potion restore amount is out of range");
    }
  }

  private requirePlannedItem(
    actual: Item,
    expected: Item,
    label: string,
  ): void {
    if (
      actual.id !== expected.id ||
      actual.typeId !== expected.typeId ||
      actual.count !== expected.count ||
      actual.version !== expected.version ||
      JSON.stringify(actual.attributes) !== JSON.stringify(expected.attributes) ||
      JSON.stringify(actual.location) !== JSON.stringify(expected.location)
    ) {
      throw new Error(`${label} diverged from its in-memory plan`);
    }
  }
}
