import { DEPOT_LIMITS } from "@tibia/protocol";
import type { Pool } from "pg";
import { TransactionRollback } from "../economy/TransactionRollback";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemMutation } from "../item/ItemMutation";
import type { DepotItemRow } from "./DepotItemRow";
import type { DepotTransferResult } from "./DepotStore";
import type { DepotTxHelper } from "./DepotTxHelper";
import { isAttributes } from "./isAttributes";
import { itemFromRow } from "./itemFromRow";
import { requireItem } from "./requireItem";
import { runSerializableTransaction } from "./runSerializableTransaction";
import { claimDeliveriesForItemUpdate } from "./sql/claimDeliveriesForItemUpdate";
import { deleteItemById } from "./sql/deleteItemById";
import { depositDepotRevisionUpdate } from "./sql/depositDepotRevisionUpdate";
import { depositItemUpdate } from "./sql/depositItemUpdate";
import { withdrawDepotRevisionUpdate } from "./sql/withdrawDepotRevisionUpdate";
import { withdrawInboxRevisionUpdate } from "./sql/withdrawInboxRevisionUpdate";
import { withdrawMergeAddUpdate } from "./sql/withdrawMergeAddUpdate";
import { withdrawMoveIntoTargetUpdate } from "./sql/withdrawMoveIntoTargetUpdate";
import { withdrawMoveToDestinationUpdate } from "./sql/withdrawMoveToDestinationUpdate";

export class DepotTransferOps {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly helper: DepotTxHelper,
  ) {}

  deposit(
    characterId: string,
    depotId: number,
    expectedDepotRevision: number,
    itemId: string,
    expectedItemRevision: number,
  ): Promise<DepotTransferResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const metadata = await this.helper.lockMetadata(client, characterId, depotId);
      if (metadata.depotRevision !== expectedDepotRevision) {
        throw new TransactionRollback<DepotTransferResult>({ status: "stale" });
      }
      const row = await this.helper.lockItem(client, itemId);
      if (!row || row.version !== expectedItemRevision) {
        throw new TransactionRollback<DepotTransferResult>({ status: "stale" });
      }
      if (
        row.location_type !== "inventory" &&
        row.location_type !== "container"
      ) {
        throw new TransactionRollback<DepotTransferResult>({
          status: "invalid-item",
        });
      }
      const type = this.catalog.require(row.item_type_id);
      if (!type.pickupable || !type.movable) {
        throw new TransactionRollback<DepotTransferResult>({
          status: "invalid-item",
        });
      }
      const root = await this.helper.ownershipRoot(client, row.id);
      if (
        !root ||
        root.character_id !== characterId ||
        !["equipment", "inventory"].includes(root.location_type)
      ) {
        throw new TransactionRollback<DepotTransferResult>({ status: "not-owned" });
      }
      const subtree = await this.helper.lockSubtree(client, row.id);
      if (metadata.depotCount + subtree.length > DEPOT_LIMITS.maxDepotItems) {
        throw new TransactionRollback<DepotTransferResult>({ status: "depot-full" });
      }
      const slot = await this.helper.firstFreeSlot(
        client,
        characterId,
        "depot",
        DEPOT_LIMITS.maxDepotItems,
        depotId,
      );
      if (slot === null) {
        throw new TransactionRollback<DepotTransferResult>({ status: "depot-full" });
      }
      const before = itemFromRow(row);
      const updated = await client.query<DepotItemRow>(depositItemUpdate, [
        row.id,
        characterId,
        depotId,
        slot,
      ]);
      const after = requireItem(updated.rows[0]);
      await client.query(depositDepotRevisionUpdate, [characterId, depotId]);
      await this.helper.auditTransfer(
        client,
        characterId,
        before,
        after,
        "depot-deposit",
      );
      return {
        status: "committed",
        mutation: { before, after: [after] },
        snapshot: await this.helper.snapshot(client, characterId, depotId),
      };
    });
  }

  withdraw(
    characterId: string,
    depotId: number,
    source: "depot" | "inbox",
    expectedSourceRevision: number,
    itemId: string,
    expectedItemRevision: number,
    capacityMax: number,
  ): Promise<DepotTransferResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      const metadata = await this.helper.lockMetadata(client, characterId, depotId);
      const currentRevision =
        source === "depot"
          ? metadata.depotRevision
          : metadata.inboxRevision;
      if (currentRevision !== expectedSourceRevision) {
        throw new TransactionRollback<DepotTransferResult>({ status: "stale" });
      }
      const row = await this.helper.lockItem(client, itemId);
      if (!row || row.version !== expectedItemRevision) {
        throw new TransactionRollback<DepotTransferResult>({ status: "stale" });
      }
      const root = await this.helper.ownershipRoot(client, row.id);
      const correctRoot =
        root?.character_id === characterId &&
        root.location_type === source &&
        (source === "inbox" || root.depot_id === depotId);
      if (!correctRoot) {
        throw new TransactionRollback<DepotTransferResult>({ status: "not-owned" });
      }
      const type = this.catalog.require(row.item_type_id);
      const subtree = await this.helper.lockSubtree(client, row.id);
      const owned = await this.helper.loadCarriedItems(client, characterId);
      const mergeTargets: DepotItemRow[] = [];
      if (type.stackable && subtree.length === 1 && isAttributes(row.attributes)) {
        const attributes = JSON.stringify(row.attributes);
        const candidates = [...owned]
          .sort((left, right) => left.id.localeCompare(right.id))
          .filter(
            (candidate) =>
              candidate.item_type_id === row.item_type_id &&
              !candidate.seed_key &&
              candidate.count < type.maxCount &&
              isAttributes(candidate.attributes) &&
              JSON.stringify(candidate.attributes) === attributes,
          );
        for (const candidate of candidates) {
          const locked = await this.helper.lockItem(client, candidate.id);
          if (
            locked &&
            locked.item_type_id === row.item_type_id &&
            !locked.seed_key &&
            locked.count < type.maxCount &&
            isAttributes(locked.attributes) &&
            JSON.stringify(locked.attributes) === attributes
          ) {
            mergeTargets.push(locked);
          }
        }
      }
      const mergeCapacity = mergeTargets.reduce(
        (total, target) => total + type.maxCount - target.count,
        0,
      );
      const remainingAfterMerge = Math.max(0, row.count - mergeCapacity);
      const needsDestination = remainingAfterMerge > 0;
      if (owned.length + (needsDestination ? subtree.length : 0) > 500) {
        throw new TransactionRollback<DepotTransferResult>({ status: "no-space" });
      }
      const usedWeight = this.helper.weightOf(owned);
      const addedWeight = this.helper.weightOf(subtree);
      if (usedWeight + addedWeight > capacityMax * 100) {
        throw new TransactionRollback<DepotTransferResult>({ status: "no-capacity" });
      }
      const [destination] = needsDestination
        ? await this.helper.lockInventoryDestinations(client, characterId, 1)
        : [];
      if (needsDestination && !destination) {
        throw new TransactionRollback<DepotTransferResult>({ status: "no-space" });
      }
      const before = itemFromRow(row);
      const operation =
        source === "depot" ? "depot-withdrawal" : "inbox-claim";
      const mergedItems: Item[] = [];
      const removedItemIds: string[] = [];
      let sourceAfter: Item | null = null;
      let remaining = row.count;
      for (const target of mergeTargets) {
        const available = type.maxCount - target.count;
        if (available < 1 || remaining < 1) continue;
        if (row.seed_key && remaining <= available) {
          await client.query(deleteItemById, [target.id]);
          const moved = await client.query<DepotItemRow>(
            withdrawMoveIntoTargetUpdate,
            [
              row.id,
              target.count + remaining,
              target.location_type,
              target.character_id,
              target.container_id,
              target.slot_index,
              target.equipment_slot,
              row.version,
            ],
          );
          sourceAfter = requireItem(moved.rows[0]);
          removedItemIds.push(target.id);
          await this.helper.auditMerge(
            client,
            characterId,
            sourceAfter,
            target.id,
            target.count,
            0,
            operation,
          );
          remaining = 0;
          break;
        }
        const added = Math.min(available, remaining);
        const updated = await client.query<DepotItemRow>(
          withdrawMergeAddUpdate,
          [target.id, added, target.version],
        );
        const merged = requireItem(updated.rows[0]);
        remaining -= added;
        mergedItems.push(merged);
        await this.helper.auditMerge(
          client,
          characterId,
          merged,
          row.id,
          added,
          remaining,
          operation,
        );
      }
      if (remaining > 0) {
        if (!destination) throw new Error("inventory destination is missing");
        const moved = await client.query<DepotItemRow>(
          withdrawMoveToDestinationUpdate,
          [
            row.id,
            remaining,
            destination.kind,
            destination.kind === "inventory" ? characterId : null,
            destination.kind === "container" ? destination.containerId : null,
            destination.slot,
            row.version,
          ],
        );
        sourceAfter = requireItem(moved.rows[0]);
      } else if (!row.seed_key) {
        await client.query(deleteItemById, [row.id]);
        removedItemIds.push(row.id);
      }
      const transferTarget =
        sourceAfter ?? mergedItems[mergedItems.length - 1];
      if (!transferTarget) throw new Error("withdrawal produced no item");
      await this.helper.auditTransfer(
        client,
        characterId,
        before,
        transferTarget,
        operation,
      );
      const descendants = subtree
        .filter((candidate) => candidate.id !== row.id)
        .map(itemFromRow);
      const mutation: ItemMutation = {
        before,
        after: [
          ...mergedItems,
          ...(sourceAfter ? [sourceAfter] : []),
          ...descendants,
        ],
        ...(removedItemIds.length > 0 ? { removedItemIds } : {}),
      };
      if (source === "depot") {
        await client.query(withdrawDepotRevisionUpdate, [characterId, depotId]);
      } else {
        await client.query(withdrawInboxRevisionUpdate, [characterId]);
        await client.query(claimDeliveriesForItemUpdate, [row.id]);
      }
      return {
        status: "committed",
        mutation,
        snapshot: await this.helper.snapshot(client, characterId, depotId),
      };
    });
  }
}
