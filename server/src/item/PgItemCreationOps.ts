import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ConjureItemResult } from "./ConjureItemResult";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemRow } from "./ItemRow";
import { itemFromRow } from "./itemFromRow";
import type { PgItemAudit } from "./PgItemAudit";
import type { PgItemGuards } from "./PgItemGuards";
import type { PgItemLocks } from "./PgItemLocks";
import { requireReturnedItem } from "./requireReturnedItem";
import { conjureCharacterResourcesUpdate } from "./sql/conjureCharacterResourcesUpdate";
import { conjureConsumeSourceUpdate } from "./sql/conjureConsumeSourceUpdate";
import { conjureTransformSourceUpdate } from "./sql/conjureTransformSourceUpdate";
import { insertConjuredItem } from "./sql/insertConjuredItem";
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

}
