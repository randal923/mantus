import type { PoolClient } from "pg";
import type { Item } from "./Item";
import { insertDecayDestroyedAudit } from "./sql/insertDecayDestroyedAudit";
import { insertItemCreatedAudit } from "./sql/insertItemCreatedAudit";
import { insertItemDestroyedAudit } from "./sql/insertItemDestroyedAudit";
import { insertItemMergedAudit } from "./sql/insertItemMergedAudit";
import { insertItemSplitAudit } from "./sql/insertItemSplitAudit";
import { insertItemTransferredAudit } from "./sql/insertItemTransferredAudit";
import { insertItemTransformedAudit } from "./sql/insertItemTransformedAudit";

export class PgItemAudit {
  async transfer(
    client: PoolClient,
    characterId: string,
    before: Item,
    after: Item,
  ): Promise<void> {
    await client.query(insertItemTransferredAudit, [
      characterId,
      before.id,
      JSON.stringify({
        from: before.location,
        to: after.location,
        count: after.count,
      }),
    ]);
  }

  async split(
    client: PoolClient,
    characterId: string,
    before: Item,
    sourceAfter: Item,
    created: Item,
  ): Promise<void> {
    await client.query(insertItemSplitAudit, [
      characterId,
      before.id,
      JSON.stringify({
        originalCount: before.count,
        remainingCount: sourceAfter.count,
        createdItemId: created.id,
        createdCount: created.count,
        destination: created.location,
      }),
    ]);
  }

  async transform(
    client: PoolClient,
    characterId: string,
    itemId: string,
    fromTypeId: number,
    toTypeId: number,
  ): Promise<void> {
    await client.query(insertItemTransformedAudit, [
      characterId,
      itemId,
      fromTypeId,
      toTypeId,
    ]);
  }

  async merge(
    client: PoolClient,
    characterId: string,
    survivor: Item,
    sourceItemId: string,
    movedCount: number,
    sourceRemaining: number,
  ): Promise<void> {
    await client.query(insertItemMergedAudit, [
      characterId,
      survivor.id,
      sourceItemId,
      movedCount,
      sourceRemaining,
      survivor.count,
    ]);
  }

  async destruction(
    client: PoolClient,
    characterId: string,
    item: Item,
    count: number,
    reason:
      | "rune"
      | "ammunition"
      | "break"
      | "food"
      | "potion"
      | "conjure-source",
  ): Promise<void> {
    await client.query(insertItemDestroyedAudit, [
      characterId,
      item.id,
      item.typeId,
      count,
      reason,
    ]);
  }

  async creation(
    client: PoolClient,
    characterId: string,
    item: Item,
    reason: "conjuring" | "potion-flask",
  ): Promise<void> {
    await client.query(insertItemCreatedAudit, [
      characterId,
      item.id,
      item.typeId,
      item.count,
      reason,
    ]);
  }

  async decayDestruction(client: PoolClient, item: Item): Promise<void> {
    await client.query(insertDecayDestroyedAudit, [
      item.id,
      item.typeId,
      item.count,
    ]);
  }
}
