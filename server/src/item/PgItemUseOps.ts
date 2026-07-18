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
import { deleteItemById } from "./sql/deleteItemById";
import { insertItemWrittenAudit } from "./sql/insertItemWrittenAudit";
import { writeTextUpdate } from "./sql/writeTextUpdate";
import { withSerializableTransaction } from "./withSerializableTransaction";

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
}
