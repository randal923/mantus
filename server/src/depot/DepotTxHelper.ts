import type { PoolClient } from "pg";
import type { Item } from "../item/Item";
import type { DepotItemRow } from "./DepotItemRow";
import { ensureStorageStateInsert } from "./sql/ensureStorageStateInsert";
import { firstFreeSlotQuery } from "./sql/firstFreeSlotQuery";
import { heldItemCountQuery } from "./sql/heldItemCountQuery";
import { lockItemQuery } from "./sql/lockItemQuery";
import { lockSubtreeQuery } from "./sql/lockSubtreeQuery";
import { ownershipRootQuery } from "./sql/ownershipRootQuery";
import { transferAuditInsert } from "./sql/transferAuditInsert";

/** Shared transaction steps for the commit-first flows (mail, reward, expiry). */
export class DepotTxHelper {
  async ensureStorageState(
    client: PoolClient,
    characterId: string,
  ): Promise<void> {
    await client.query(ensureStorageStateInsert, [characterId]);
  }

  async heldItemCount(
    client: PoolClient,
    characterId: string,
    location: "depot" | "inbox",
    depotId?: number,
  ): Promise<number> {
    const result = await client.query<{ count: string }>(
      heldItemCountQuery(location),
      [characterId, depotId ?? null],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async lockItem(
    client: PoolClient,
    itemId: string,
  ): Promise<DepotItemRow | null> {
    const result = await client.query<DepotItemRow>(lockItemQuery, [itemId]);
    return result.rows[0] ?? null;
  }

  async ownershipRoot(
    client: PoolClient,
    itemId: string,
  ): Promise<DepotItemRow | null> {
    const result = await client.query<DepotItemRow>(ownershipRootQuery, [
      itemId,
    ]);
    return result.rows[0] ?? null;
  }

  async lockSubtree(
    client: PoolClient,
    itemId: string,
  ): Promise<DepotItemRow[]> {
    const result = await client.query<DepotItemRow>(lockSubtreeQuery, [itemId]);
    if (result.rows.length === 0) throw new Error("item subtree is missing");
    return result.rows;
  }

  async firstFreeSlot(
    client: PoolClient,
    characterId: string,
    location: "depot" | "inbox" | "inventory",
    capacity: number,
    depotId?: number,
  ): Promise<number | null> {
    const result = await client.query<{ slot: number }>(firstFreeSlotQuery, [
      characterId,
      location,
      capacity,
      depotId ?? null,
    ]);
    return result.rows[0]?.slot ?? null;
  }

  async auditTransfer(
    client: PoolClient,
    characterId: string,
    before: Item,
    after: Item,
    operation: string,
  ): Promise<void> {
    await client.query(transferAuditInsert, [
      characterId,
      before.id,
      operation,
      JSON.stringify(before.location),
      JSON.stringify(after.location),
    ]);
  }
}
