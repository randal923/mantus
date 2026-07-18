import { randomUUID } from "node:crypto";
import { DEPOT_LIMITS } from "@tibia/protocol";
import type { Pool } from "pg";
import { TransactionRollback } from "../economy/TransactionRollback";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemMutation } from "../item/ItemMutation";
import type { DepotItemRow } from "./DepotItemRow";
import type { StashTransferResult } from "./DepotStore";
import type { DepotTxHelper } from "./DepotTxHelper";
import { isAttributes } from "./isAttributes";
import { itemFromRow } from "./itemFromRow";
import { requireItem } from "./requireItem";
import { runSerializableTransaction } from "./runSerializableTransaction";
import { bumpStashRevisionUpdate } from "./sql/bumpStashRevisionUpdate";
import { decrementStashCountUpdate } from "./sql/decrementStashCountUpdate";
import { deleteItemById } from "./sql/deleteItemById";
import { deleteStashRow } from "./sql/deleteStashRow";
import { stashCountForUpdateQuery } from "./sql/stashCountForUpdateQuery";
import { stashDepositAuditInsert } from "./sql/stashDepositAuditInsert";
import { stashDepositDecrementUpdate } from "./sql/stashDepositDecrementUpdate";
import { stashUpsertInsert } from "./sql/stashUpsertInsert";
import { stashWithdrawAuditInsert } from "./sql/stashWithdrawAuditInsert";
import { stashWithdrawItemInsert } from "./sql/stashWithdrawItemInsert";
import { stashWithdrawMergeUpdate } from "./sql/stashWithdrawMergeUpdate";

export class DepotStashOps {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly helper: DepotTxHelper,
  ) {}

  depositStash(
    characterId: string,
    depotId: number,
    expectedStashRevision: number,
    itemId: string,
    expectedItemRevision: number,
    count: number,
  ): Promise<StashTransferResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const metadata = await this.helper.lockMetadata(client, characterId, depotId);
      if (metadata.stashRevision !== expectedStashRevision) {
        throw new TransactionRollback<StashTransferResult>({ status: "stale" });
      }
      const row = await this.helper.lockItem(client, itemId);
      if (!row || row.version !== expectedItemRevision) {
        throw new TransactionRollback<StashTransferResult>({ status: "stale" });
      }
      if (
        row.location_type !== "inventory" &&
        row.location_type !== "container"
      ) {
        throw new TransactionRollback<StashTransferResult>({
          status: "invalid-item",
        });
      }
      const root = await this.helper.ownershipRoot(client, row.id);
      if (
        !root ||
        root.character_id !== characterId ||
        !["equipment", "inventory"].includes(root.location_type)
      ) {
        throw new TransactionRollback<StashTransferResult>({ status: "not-owned" });
      }
      const type = this.catalog.require(row.item_type_id);
      if (
        !type.stowable ||
        !type.pickupable ||
        !type.movable ||
        type.containerCapacity !== undefined ||
        !isAttributes(row.attributes) ||
        Object.keys(row.attributes).length > 0
      ) {
        throw new TransactionRollback<StashTransferResult>({ status: "stash-only" });
      }
      if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > row.count ||
        (!type.stackable && count !== row.count)
      ) {
        throw new TransactionRollback<StashTransferResult>({
          status: "invalid-item",
        });
      }
      const existing = await client.query<{ count: string }>(
        stashCountForUpdateQuery,
        [characterId, row.item_type_id],
      );
      const nextStashCount = Number(existing.rows[0]?.count ?? 0) + count;
      if (nextStashCount > DEPOT_LIMITS.maxStashAmount) {
        throw new TransactionRollback<StashTransferResult>({ status: "no-space" });
      }
      const before = itemFromRow(row);
      let mutation: ItemMutation;
      if (count === row.count) {
        await client.query(deleteItemById, [row.id]);
        mutation = { before, after: [], removedItemIds: [row.id] };
      } else {
        const updated = await client.query<DepotItemRow>(
          stashDepositDecrementUpdate,
          [row.id, count],
        );
        mutation = { before, after: [requireItem(updated.rows[0])] };
      }
      await client.query(stashUpsertInsert, [
        characterId,
        row.item_type_id,
        nextStashCount,
      ]);
      await client.query(bumpStashRevisionUpdate, [characterId]);
      await client.query(stashDepositAuditInsert, [
        characterId,
        row.id,
        row.item_type_id,
        count,
      ]);
      return {
        status: "committed",
        mutation,
        snapshot: await this.helper.snapshot(client, characterId, depotId),
      };
    });
  }

  withdrawStash(
    characterId: string,
    depotId: number,
    expectedStashRevision: number,
    itemTypeId: number,
    count: number,
    capacityMax: number,
  ): Promise<StashTransferResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const metadata = await this.helper.lockMetadata(client, characterId, depotId);
      if (metadata.stashRevision !== expectedStashRevision) {
        throw new TransactionRollback<StashTransferResult>({ status: "stale" });
      }
      const type = this.catalog.get(itemTypeId);
      if (
        !type ||
        !type.stowable ||
        !type.pickupable ||
        !type.movable ||
        type.containerCapacity !== undefined ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > DEPOT_LIMITS.maxTransferCount
      ) {
        throw new TransactionRollback<StashTransferResult>({ status: "stash-only" });
      }
      const stash = await client.query<{ count: string }>(
        stashCountForUpdateQuery,
        [characterId, itemTypeId],
      );
      const currentCount = Number(stash.rows[0]?.count ?? 0);
      if (currentCount < count) {
        throw new TransactionRollback<StashTransferResult>({ status: "not-owned" });
      }
      const carried = await this.helper.loadCarriedItems(client, characterId);
      if (this.helper.weightOf(carried) + type.weight * count > capacityMax * 100) {
        throw new TransactionRollback<StashTransferResult>({ status: "no-capacity" });
      }
      const mergeTargets: DepotItemRow[] = [];
      if (type.stackable) {
        const candidates = [...carried]
          .sort((left, right) => left.id.localeCompare(right.id))
          .filter(
            (row) =>
              row.item_type_id === itemTypeId &&
              !row.seed_key &&
              row.count < type.maxCount &&
              isAttributes(row.attributes) &&
              Object.keys(row.attributes).length === 0,
          );
        for (const candidate of candidates) {
          const locked = await this.helper.lockItem(client, candidate.id);
          if (
            locked &&
            locked.item_type_id === itemTypeId &&
            !locked.seed_key &&
            locked.count < type.maxCount &&
            isAttributes(locked.attributes) &&
            Object.keys(locked.attributes).length === 0
          ) {
            mergeTargets.push(locked);
          }
        }
      }
      const mergeCapacity = mergeTargets.reduce(
        (total, target) => total + type.maxCount - target.count,
        0,
      );
      const unmergedCount = Math.max(0, count - mergeCapacity);
      const createdRowCount = type.stackable
        ? Math.ceil(unmergedCount / type.maxCount)
        : count;
      if (carried.length + createdRowCount > 500) {
        throw new TransactionRollback<StashTransferResult>({ status: "no-space" });
      }
      const destinations = await this.helper.lockInventoryDestinations(
        client,
        characterId,
        createdRowCount,
      );
      if (destinations.length !== createdRowCount) {
        throw new TransactionRollback<StashTransferResult>({ status: "no-space" });
      }
      if (currentCount === count) {
        await client.query(deleteStashRow, [characterId, itemTypeId]);
      } else {
        await client.query(decrementStashCountUpdate, [
          characterId,
          itemTypeId,
          count,
        ]);
      }
      const withdrawalItems: Item[] = [];
      const createdAmounts: Array<{ item: Item; count: number }> = [];
      let remaining = count;
      for (const target of mergeTargets) {
        if (remaining === 0) break;
        const added = Math.min(type.maxCount - target.count, remaining);
        if (added < 1) continue;
        const updated = await client.query<DepotItemRow>(
          stashWithdrawMergeUpdate,
          [target.id, added, target.version],
        );
        const after = requireItem(updated.rows[0]);
        withdrawalItems.push(after);
        createdAmounts.push({ item: after, count: added });
        remaining -= added;
      }
      for (const destination of destinations) {
        const createdCount = type.stackable
          ? Math.min(type.maxCount, remaining)
          : 1;
        const created = await client.query<DepotItemRow>(
          stashWithdrawItemInsert,
          [
            randomUUID(),
            itemTypeId,
            createdCount,
            destination.kind,
            destination.kind === "inventory" ? characterId : null,
            destination.kind === "container"
              ? destination.containerId
              : null,
            destination.slot,
          ],
        );
        const item = requireItem(created.rows[0]);
        withdrawalItems.push(item);
        createdAmounts.push({ item, count: createdCount });
        remaining -= createdCount;
      }
      if (remaining !== 0) throw new Error("stash withdrawal plan is incomplete");
      const mutation: ItemMutation = { after: withdrawalItems };
      await client.query(bumpStashRevisionUpdate, [characterId]);
      for (const created of createdAmounts) {
        await client.query(stashWithdrawAuditInsert, [
          characterId,
          created.item.id,
          itemTypeId,
          created.count,
        ]);
      }
      return {
        status: "committed",
        mutation,
        snapshot: await this.helper.snapshot(client, characterId, depotId),
      };
    });
  }
}
