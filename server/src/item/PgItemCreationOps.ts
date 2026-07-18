import { randomUUID } from "node:crypto";
import type { Position } from "@tibia/protocol";
import type { Pool } from "pg";
import type { ConjureItemResult } from "./ConjureItemResult";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemRow } from "./ItemRow";
import { itemFromRow } from "./itemFromRow";
import type { LootItemCreation } from "./LootItemCreation";
import type { PgItemAudit } from "./PgItemAudit";
import type { PgItemGuards } from "./PgItemGuards";
import type { PgItemLocks } from "./PgItemLocks";
import { requireReturnedItem } from "./requireReturnedItem";
import { conjureCharacterResourcesUpdate } from "./sql/conjureCharacterResourcesUpdate";
import { conjureConsumeSourceUpdate } from "./sql/conjureConsumeSourceUpdate";
import { conjureTransformSourceUpdate } from "./sql/conjureTransformSourceUpdate";
import { insertConjuredItem } from "./sql/insertConjuredItem";
import { insertCorpseItem } from "./sql/insertCorpseItem";
import { insertCorpseLootItem } from "./sql/insertCorpseLootItem";
import { insertLootCreatedAudit } from "./sql/insertLootCreatedAudit";
import { ownedItemsQuery } from "./sql/ownedItemsQuery";
import { withSerializableTransaction } from "./withSerializableTransaction";

export class PgItemCreationOps {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly mapName: string,
    private readonly locks: PgItemLocks,
    private readonly guards: PgItemGuards,
    private readonly audit: PgItemAudit,
  ) {}

  conjure(
    characterId: string,
    expectedCharacterVersion: number,
    expectedMana: number,
    expectedSoul: number,
    manaCost: number,
    soulCost: number,
    sourceItemTypeId: number,
    targetItemTypeId: number,
    count: number,
  ): Promise<ConjureItemResult> {
    return withSerializableTransaction(this.pool, async (client) => {
      const character = await this.locks.lockCharacter(client, characterId);
      if (
        character.version !== expectedCharacterVersion ||
        character.mana !== expectedMana ||
        character.soul !== expectedSoul ||
        !Number.isInteger(manaCost) ||
        manaCost < 0 ||
        character.mana < manaCost ||
        !Number.isInteger(soulCost) ||
        soulCost < 0 ||
        character.soul < soulCost
      ) {
        throw new Error("character resources are stale");
      }
      const targetType = this.catalog.require(targetItemTypeId);
      if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > targetType.maxCount
      ) {
        throw new Error("conjured item count is out of range");
      }
      const source =
        sourceItemTypeId === 0
          ? undefined
          : await this.locks.lockOwnedItemByType(
              client,
              characterId,
              sourceItemTypeId,
            );
      if (sourceItemTypeId !== 0 && !source) {
        throw new Error("conjure source item is missing");
      }
      const currentItems = await client.query<ItemRow>(ownedItemsQuery, [
        characterId,
      ]);
      if (currentItems.rows.length > 500) {
        throw new Error("character has excessive items");
      }
      const currentWeight = currentItems.rows.reduce(
        (total, item) =>
          total + this.catalog.require(item.item_type_id).weight * item.count,
        0,
      );
      const sourceWeight = source
        ? this.catalog.require(source.item_type_id).weight
        : 0;
      const resultWeight =
        targetType.weight * count;
      if (
        currentWeight - sourceWeight + resultWeight >
        character.capacity * 100
      ) {
        throw new Error("character capacity exceeded");
      }

      const characterResult = await client.query<{ version: number }>(
        conjureCharacterResourcesUpdate,
        [
          characterId,
          expectedCharacterVersion,
          manaCost,
          soulCost,
          expectedMana,
          expectedSoul,
        ],
      );
      const characterVersion = characterResult.rows[0]?.version;
      if (characterVersion !== expectedCharacterVersion + 1) {
        throw new Error("character resources changed during conjuring");
      }

      const before = source ? itemFromRow(source) : undefined;
      if (source?.count === 1) {
        const transformed = await client.query<ItemRow>(
          conjureTransformSourceUpdate,
          [source.id, targetItemTypeId, count],
        );
        const after = requireReturnedItem(transformed.rows[0]);
        await this.audit.destruction(
          client,
          characterId,
          before!,
          1,
          "conjure-source",
        );
        await this.audit.creation(
          client,
          characterId,
          after,
          "conjuring",
        );
        return {
          mutation: { before, after: [after] },
          characterVersion,
        };
      }

      const after: Item[] = [];
      if (source) {
        const remaining = await client.query<ItemRow>(
          conjureConsumeSourceUpdate,
          [source.id],
        );
        after.push(requireReturnedItem(remaining.rows[0]));
        await this.audit.destruction(
          client,
          characterId,
          before!,
          1,
          "conjure-source",
        );
      }
      await this.guards.requireOwnedItemSpace(client, characterId);
      const backpack = await this.locks.lockBackpack(client, characterId);
      const slot = await this.locks.firstContainerSlot(client, backpack);
      const itemId = randomUUID();
      const inserted = await client.query<ItemRow>(insertConjuredItem, [
        itemId,
        targetItemTypeId,
        count,
        backpack.id,
        slot,
      ]);
      const created = requireReturnedItem(inserted.rows[0]);
      after.push(created);
      await this.audit.creation(
        client,
        characterId,
        created,
        "conjuring",
      );
      return {
        mutation: { ...(before ? { before } : {}), after },
        characterVersion,
      };
    });
  }

  createCorpse(
    characterId: string | null,
    eventId: string,
    position: Position,
    stackIndex: number,
    corpseTypeId: number,
    loot: ReadonlyArray<LootItemCreation>,
  ): Promise<ReadonlyArray<Item>> {
    return withSerializableTransaction(this.pool, async (client) => {
      if (!/^[A-Za-z0-9:_-]{1,128}$/.test(eventId)) {
        throw new Error("loot event id is invalid");
      }
      if (!Number.isInteger(stackIndex) || stackIndex < 0 || stackIndex > 255) {
        throw new Error("corpse stack index is invalid");
      }
      const corpseType = this.catalog.require(corpseTypeId);
      const capacity = corpseType.containerCapacity ?? 0;
      if (capacity < loot.length) {
        throw new Error("corpse cannot contain rolled loot");
      }
      for (const entry of loot) {
        const type = this.catalog.require(entry.typeId);
        if (
          !Number.isInteger(entry.count) ||
          entry.count < 1 ||
          entry.count > type.maxCount
        ) {
          throw new Error("loot count is invalid");
        }
      }
      const corpseId = randomUUID();
      const corpseResult = await client.query<ItemRow>(insertCorpseItem, [
        corpseId,
        corpseTypeId,
        this.mapName,
        position.x,
        position.y,
        position.z,
        stackIndex,
        JSON.stringify(
          characterId ? { ownerCharacterId: characterId } : {},
        ),
      ]);
      const created = [requireReturnedItem(corpseResult.rows[0])];
      for (let slot = 0; slot < loot.length; slot++) {
        const entry = loot[slot];
        if (!entry) continue;
        const result = await client.query<ItemRow>(insertCorpseLootItem, [
          randomUUID(),
          entry.typeId,
          entry.count,
          corpseId,
          slot,
        ]);
        created.push(requireReturnedItem(result.rows[0]));
      }
      for (const item of created) {
        await client.query(insertLootCreatedAudit, [
          characterId,
          item.id,
          eventId,
          item.typeId,
          item.count,
        ]);
      }
      return created;
    });
  }
}
