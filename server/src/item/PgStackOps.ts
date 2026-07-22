import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemMutation } from "./ItemMutation";
import type { ItemRow } from "./ItemRow";
import { itemFromRow } from "./itemFromRow";
import type { PgItemAudit } from "./PgItemAudit";
import type { PgItemGuards } from "./PgItemGuards";
import type { PgItemLocks } from "./PgItemLocks";
import { requireReturnedItem } from "./requireReturnedItem";
import { requireVersion } from "./requireVersion";
import { decrementItemCountUpdate } from "./sql/decrementItemCountUpdate";
import { insertSplitItem } from "./sql/insertSplitItem";
import { rotateItemUpdate } from "./sql/rotateItemUpdate";
import { withSerializableTransaction } from "./withSerializableTransaction";

export class PgStackOps {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly locks: PgItemLocks,
    private readonly guards: PgItemGuards,
    private readonly audit: PgItemAudit,
  ) {}

  split(
    characterId: string,
    itemId: string,
    expectedVersion: number,
    count: number,
  ): Promise<ItemMutation> {
    return withSerializableTransaction(this.pool, async (client) => {
      await this.locks.lockCharacter(client, characterId);
      const row = await this.locks.lockItem(client, itemId);
      requireVersion(row, expectedVersion);
      await this.guards.requireOwned(client, row.id, characterId);
      const type = this.catalog.require(row.item_type_id);
      if (!type.stackable || count < 1 || count >= row.count) {
        throw new Error("invalid stack split");
      }
      await this.guards.requireOwnedItemSpace(client, characterId);
      if (row.location_type !== "container") {
        throw new Error("stack cannot be split in this location");
      }
      const before = itemFromRow(row);
      const container = await this.locks.lockItem(
        client,
        row.container_id ?? "",
      );
      const destinationSlot = await this.locks.firstContainerSlot(
        client,
        container,
      );
      const sourceResult = await client.query<ItemRow>(
        decrementItemCountUpdate,
        [row.id, count],
      );
      const createdId = randomUUID();
      const createdResult = await client.query<ItemRow>(insertSplitItem, [
        createdId,
        row.item_type_id,
        count,
        JSON.stringify(row.attributes),
        "container",
        null,
        row.container_id,
        destinationSlot,
      ]);
      const sourceAfter = requireReturnedItem(sourceResult.rows[0]);
      const created = requireReturnedItem(createdResult.rows[0]);
      await this.audit.split(client, characterId, before, sourceAfter, created);
      return { before, after: [sourceAfter, created] };
    });
  }

  rotate(
    characterId: string,
    itemId: string,
    expectedVersion: number,
  ): Promise<ItemMutation> {
    return withSerializableTransaction(this.pool, async (client) => {
      await this.locks.lockCharacter(client, characterId);
      const row = await this.locks.lockItem(client, itemId);
      requireVersion(row, expectedVersion);
      await this.guards.requireOwned(client, row.id, characterId);
      const before = itemFromRow(row);
      const targetId = this.catalog.require(row.item_type_id).rotateTo;
      if (!targetId) throw new Error("item cannot be rotated");
      this.catalog.require(targetId);
      const result = await client.query<ItemRow>(rotateItemUpdate, [
        row.id,
        targetId,
      ]);
      const after = requireReturnedItem(result.rows[0]);
      await this.audit.transform(
        client,
        characterId,
        row.id,
        row.item_type_id,
        targetId,
      );
      return { before, after: [after] };
    });
  }
}
