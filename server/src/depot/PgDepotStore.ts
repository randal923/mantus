import { randomUUID } from "node:crypto";
import {
  DEPOT_LIMITS,
  type DepotLocation,
  type EquipmentSlot,
} from "@tibia/protocol";
import { Pool, type PoolClient } from "pg";
import { TransactionRollback } from "../economy/TransactionRollback";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemLocation } from "../item/ItemLocation";
import type { ItemMutation } from "../item/ItemMutation";
import type {
  DepotItemRecord,
  DepotPage,
  DepotSnapshot,
  DepotStore,
  DepotTransferResult,
  ExpiredDeliveryResult,
  RewardDeliveryRequest,
  RewardDeliveryResult,
  SendMailRequest,
  SendMailResult,
  StashTransferResult,
} from "./DepotStore";

interface DepotItemRow {
  id: string;
  item_type_id: number;
  count: number;
  attributes: unknown;
  version: number;
  location_type: ItemLocation["kind"];
  character_id: string | null;
  container_id: string | null;
  slot_index: number | null;
  equipment_slot: EquipmentSlot | null;
  world_x: number | null;
  world_y: number | null;
  world_z: number | null;
  world_stack_index: number | null;
  seed_key: string | null;
  depot_id: number | null;
}

interface StorageStateRow {
  inbox_revision: number;
  stash_revision: number;
}

interface DepotStateRow {
  revision: number;
}

interface DeliveryRow {
  delivery_kind: "mail" | "reward" | "system";
  recipient_character_id: string;
  return_character_id: string | null;
  item_id: string | null;
  original_item_id: string;
  status: "delivered" | "claimed" | "returned";
  recipient_name?: string;
}

type InventoryDestination = Extract<
  ItemLocation,
  { kind: "inventory" | "container" }
>;

const ITEM_COLUMNS = `
  id, item_type_id, count, attributes, version, location_type,
  character_id, container_id, slot_index, equipment_slot,
  world_x, world_y, world_z, world_stack_index, seed_key, depot_id`;

function isAttributes(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function locationFromRow(row: DepotItemRow): ItemLocation {
  if (
    row.location_type === "equipment" &&
    row.character_id &&
    row.equipment_slot
  ) {
    return {
      kind: "equipment",
      characterId: row.character_id,
      slot: row.equipment_slot,
    };
  }
  if (
    row.location_type === "depot" &&
    row.character_id &&
    row.depot_id !== null &&
    row.slot_index !== null
  ) {
    return {
      kind: "depot",
      characterId: row.character_id,
      depotId: row.depot_id,
      slot: row.slot_index,
    };
  }
  if (
    ["inventory", "inbox", "trade-reservation", "market-escrow"].includes(
      row.location_type,
    ) &&
    row.character_id &&
    row.slot_index !== null
  ) {
    return {
      kind: row.location_type as
        | "inventory"
        | "inbox"
        | "trade-reservation"
        | "market-escrow",
      characterId: row.character_id,
      slot: row.slot_index,
    };
  }
  if (
    (row.location_type === "container" || row.location_type === "corpse") &&
    row.container_id &&
    row.slot_index !== null
  ) {
    return {
      kind: row.location_type,
      containerId: row.container_id,
      slot: row.slot_index,
    };
  }
  if (
    (row.location_type === "world" || row.location_type === "house") &&
    row.world_x !== null &&
    row.world_y !== null &&
    row.world_z !== null &&
    row.world_stack_index !== null
  ) {
    return {
      kind: row.location_type,
      position: { x: row.world_x, y: row.world_y, z: row.world_z },
      stackIndex: row.world_stack_index,
    };
  }
  throw new Error(`item ${row.id} has an invalid persisted location`);
}

function itemFromRow(row: DepotItemRow): Item {
  if (!isAttributes(row.attributes)) {
    throw new Error(`item ${row.id} has invalid attributes`);
  }
  return {
    id: row.id,
    typeId: row.item_type_id,
    count: row.count,
    attributes: row.attributes,
    version: row.version,
    location: locationFromRow(row),
    ...(row.seed_key ? { seedKey: row.seed_key } : {}),
  };
}

export class PgDepotStore implements DepotStore {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
  ) {}

  browse(
    characterId: string,
    depotId: number,
    location: DepotLocation,
    page: number,
    matchingItemTypeIds: ReadonlyArray<number> | null,
  ): Promise<DepotPage> {
    return this.transaction(async (client) => {
      await this.lockMetadata(client, characterId, depotId);
      const snapshot = await this.snapshot(client, characterId, depotId);
      if (location === "stash") {
        return this.browseStash(
          client,
          characterId,
          page,
          matchingItemTypeIds,
          snapshot,
        );
      }
      return this.browseItems(
        client,
        characterId,
        depotId,
        location,
        page,
        matchingItemTypeIds,
        snapshot,
      );
    });
  }

  deposit(
    characterId: string,
    depotId: number,
    expectedDepotRevision: number,
    itemId: string,
    expectedItemRevision: number,
  ): Promise<DepotTransferResult> {
    return this.transaction(async (client) => {
      const metadata = await this.lockMetadata(client, characterId, depotId);
      if (metadata.depotRevision !== expectedDepotRevision) {
        throw new TransactionRollback<DepotTransferResult>({ status: "stale" });
      }
      const row = await this.lockItem(client, itemId);
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
      const root = await this.ownershipRoot(client, row.id);
      if (
        !root ||
        root.character_id !== characterId ||
        !["equipment", "inventory"].includes(root.location_type)
      ) {
        throw new TransactionRollback<DepotTransferResult>({ status: "not-owned" });
      }
      const subtree = await this.lockSubtree(client, row.id);
      if (metadata.depotCount + subtree.length > DEPOT_LIMITS.maxDepotItems) {
        throw new TransactionRollback<DepotTransferResult>({ status: "depot-full" });
      }
      const slot = await this.firstFreeSlot(
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
      const updated = await client.query<DepotItemRow>(
        `UPDATE items
         SET location_type = 'depot', character_id = $2, depot_id = $3,
             slot_index = $4, container_id = null, equipment_slot = null,
             world_map_name = null, world_x = null, world_y = null,
             world_z = null, world_stack_index = null,
             version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${ITEM_COLUMNS}`,
        [row.id, characterId, depotId, slot],
      );
      const after = this.requireItem(updated.rows[0]);
      await client.query(
        `UPDATE character_depots
         SET revision = revision + 1, updated_at = now()
         WHERE character_id = $1 AND depot_id = $2`,
        [characterId, depotId],
      );
      await this.auditTransfer(client, characterId, before, after, "depot-deposit");
      return {
        status: "committed",
        mutation: { before, after: [after] },
        snapshot: await this.snapshot(client, characterId, depotId),
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
    return this.transaction(async (client) => {
      const metadata = await this.lockMetadata(client, characterId, depotId);
      const currentRevision =
        source === "depot"
          ? metadata.depotRevision
          : metadata.inboxRevision;
      if (currentRevision !== expectedSourceRevision) {
        throw new TransactionRollback<DepotTransferResult>({ status: "stale" });
      }
      const row = await this.lockItem(client, itemId);
      if (!row || row.version !== expectedItemRevision) {
        throw new TransactionRollback<DepotTransferResult>({ status: "stale" });
      }
      const root = await this.ownershipRoot(client, row.id);
      const correctRoot =
        root?.character_id === characterId &&
        root.location_type === source &&
        (source === "inbox" || root.depot_id === depotId);
      if (!correctRoot) {
        throw new TransactionRollback<DepotTransferResult>({ status: "not-owned" });
      }
      const type = this.catalog.require(row.item_type_id);
      const subtree = await this.lockSubtree(client, row.id);
      const owned = await this.loadCarriedItems(client, characterId);
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
          const locked = await this.lockItem(client, candidate.id);
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
      const usedWeight = this.weightOf(owned);
      const addedWeight = this.weightOf(subtree);
      if (usedWeight + addedWeight > capacityMax * 100) {
        throw new TransactionRollback<DepotTransferResult>({ status: "no-capacity" });
      }
      const [destination] = needsDestination
        ? await this.lockInventoryDestinations(client, characterId, 1)
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
          await client.query("DELETE FROM items WHERE id = $1", [target.id]);
          const moved = await client.query<DepotItemRow>(
            `UPDATE items
             SET count = $2, location_type = $3, character_id = $4,
                 container_id = $5, slot_index = $6, equipment_slot = $7,
                 depot_id = null, world_map_name = null, world_x = null,
                 world_y = null, world_z = null, world_stack_index = null,
                 version = version + 1, updated_at = now()
             WHERE id = $1 AND version = $8
             RETURNING ${ITEM_COLUMNS}`,
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
          sourceAfter = this.requireItem(moved.rows[0]);
          removedItemIds.push(target.id);
          await this.auditMerge(
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
          `UPDATE items
           SET count = count + $2, version = version + 1,
               updated_at = now()
           WHERE id = $1 AND version = $3
           RETURNING ${ITEM_COLUMNS}`,
          [target.id, added, target.version],
        );
        const merged = this.requireItem(updated.rows[0]);
        remaining -= added;
        mergedItems.push(merged);
        await this.auditMerge(
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
          `UPDATE items
           SET count = $2, location_type = $3, character_id = $4,
               depot_id = null, slot_index = $6, container_id = $5,
               equipment_slot = null, world_map_name = null,
               world_x = null, world_y = null, world_z = null,
               world_stack_index = null, version = version + 1,
               updated_at = now()
           WHERE id = $1 AND version = $7
           RETURNING ${ITEM_COLUMNS}`,
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
        sourceAfter = this.requireItem(moved.rows[0]);
      } else if (!row.seed_key) {
        await client.query("DELETE FROM items WHERE id = $1", [row.id]);
        removedItemIds.push(row.id);
      }
      const transferTarget =
        sourceAfter ?? mergedItems[mergedItems.length - 1];
      if (!transferTarget) throw new Error("withdrawal produced no item");
      await this.auditTransfer(
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
        await client.query(
          `UPDATE character_depots
           SET revision = revision + 1, updated_at = now()
           WHERE character_id = $1 AND depot_id = $2`,
          [characterId, depotId],
        );
      } else {
        await client.query(
          `UPDATE character_storage_state
           SET inbox_revision = inbox_revision + 1, updated_at = now()
           WHERE character_id = $1`,
          [characterId],
        );
        await client.query(
          `UPDATE inbox_deliveries
           SET status = 'claimed', completed_at = now()
           WHERE status = 'delivered'
             AND (item_id = $1 OR original_item_id = $1)`,
          [row.id],
        );
      }
      return {
        status: "committed",
        mutation,
        snapshot: await this.snapshot(client, characterId, depotId),
      };
    });
  }

  depositStash(
    characterId: string,
    depotId: number,
    expectedStashRevision: number,
    itemId: string,
    expectedItemRevision: number,
    count: number,
  ): Promise<StashTransferResult> {
    return this.transaction(async (client) => {
      const metadata = await this.lockMetadata(client, characterId, depotId);
      if (metadata.stashRevision !== expectedStashRevision) {
        throw new TransactionRollback<StashTransferResult>({ status: "stale" });
      }
      const row = await this.lockItem(client, itemId);
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
      const root = await this.ownershipRoot(client, row.id);
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
        `SELECT count::text AS count
         FROM supply_stash
         WHERE character_id = $1 AND item_type_id = $2
         FOR UPDATE`,
        [characterId, row.item_type_id],
      );
      const nextStashCount = Number(existing.rows[0]?.count ?? 0) + count;
      if (nextStashCount > DEPOT_LIMITS.maxStashAmount) {
        throw new TransactionRollback<StashTransferResult>({ status: "no-space" });
      }
      const before = itemFromRow(row);
      let mutation: ItemMutation;
      if (count === row.count) {
        await client.query("DELETE FROM items WHERE id = $1", [row.id]);
        mutation = { before, after: [], removedItemIds: [row.id] };
      } else {
        const updated = await client.query<DepotItemRow>(
          `UPDATE items
           SET count = count - $2, version = version + 1, updated_at = now()
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [row.id, count],
        );
        mutation = { before, after: [this.requireItem(updated.rows[0])] };
      }
      await client.query(
        `INSERT INTO supply_stash (character_id, item_type_id, count)
         VALUES ($1, $2, $3)
         ON CONFLICT (character_id, item_type_id)
         DO UPDATE SET count = EXCLUDED.count, updated_at = now()`,
        [characterId, row.item_type_id, nextStashCount],
      );
      await client.query(
        `UPDATE character_storage_state
         SET stash_revision = stash_revision + 1, updated_at = now()
         WHERE character_id = $1`,
        [characterId],
      );
      await client.query(
        `INSERT INTO audit_log(event_type, character_id, item_id, details)
         VALUES (
           'item-transferred', $1, $2,
           jsonb_build_object(
             'operation', 'stash-deposit', 'itemTypeId', $3::integer,
             'count', $4::integer
           )
         )`,
        [characterId, row.id, row.item_type_id, count],
      );
      return {
        status: "committed",
        mutation,
        snapshot: await this.snapshot(client, characterId, depotId),
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
    return this.transaction(async (client) => {
      const metadata = await this.lockMetadata(client, characterId, depotId);
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
        `SELECT count::text AS count
         FROM supply_stash
         WHERE character_id = $1 AND item_type_id = $2
         FOR UPDATE`,
        [characterId, itemTypeId],
      );
      const currentCount = Number(stash.rows[0]?.count ?? 0);
      if (currentCount < count) {
        throw new TransactionRollback<StashTransferResult>({ status: "not-owned" });
      }
      const carried = await this.loadCarriedItems(client, characterId);
      if (this.weightOf(carried) + type.weight * count > capacityMax * 100) {
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
          const locked = await this.lockItem(client, candidate.id);
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
      const destinations = await this.lockInventoryDestinations(
        client,
        characterId,
        createdRowCount,
      );
      if (destinations.length !== createdRowCount) {
        throw new TransactionRollback<StashTransferResult>({ status: "no-space" });
      }
      if (currentCount === count) {
        await client.query(
          `DELETE FROM supply_stash
           WHERE character_id = $1 AND item_type_id = $2`,
          [characterId, itemTypeId],
        );
      } else {
        await client.query(
          `UPDATE supply_stash
           SET count = count - $3, updated_at = now()
           WHERE character_id = $1 AND item_type_id = $2`,
          [characterId, itemTypeId, count],
        );
      }
      const withdrawalItems: Item[] = [];
      const createdAmounts: Array<{ item: Item; count: number }> = [];
      let remaining = count;
      for (const target of mergeTargets) {
        if (remaining === 0) break;
        const added = Math.min(type.maxCount - target.count, remaining);
        if (added < 1) continue;
        const updated = await client.query<DepotItemRow>(
          `UPDATE items
           SET count = count + $2, version = version + 1, updated_at = now()
           WHERE id = $1 AND version = $3
           RETURNING ${ITEM_COLUMNS}`,
          [target.id, added, target.version],
        );
        const after = this.requireItem(updated.rows[0]);
        withdrawalItems.push(after);
        createdAmounts.push({ item: after, count: added });
        remaining -= added;
      }
      for (const destination of destinations) {
        const createdCount = type.stackable
          ? Math.min(type.maxCount, remaining)
          : 1;
        const created = await client.query<DepotItemRow>(
          `INSERT INTO items (
             id, item_type_id, count, location_type, character_id,
             container_id, slot_index
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING ${ITEM_COLUMNS}`,
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
        const item = this.requireItem(created.rows[0]);
        withdrawalItems.push(item);
        createdAmounts.push({ item, count: createdCount });
        remaining -= createdCount;
      }
      if (remaining !== 0) throw new Error("stash withdrawal plan is incomplete");
      const mutation: ItemMutation = { after: withdrawalItems };
      await client.query(
        `UPDATE character_storage_state
         SET stash_revision = stash_revision + 1, updated_at = now()
         WHERE character_id = $1`,
        [characterId],
      );
      for (const created of createdAmounts) {
        await client.query(
          `INSERT INTO audit_log(event_type, character_id, item_id, details)
           VALUES (
             'item-created', $1, $2,
             jsonb_build_object(
               'operation', 'stash-withdrawal', 'itemTypeId', $3::integer,
               'count', $4::integer
             )
           )`,
          [
            characterId,
            created.item.id,
            itemTypeId,
            created.count,
          ],
        );
      }
      return {
        status: "committed",
        mutation,
        snapshot: await this.snapshot(client, characterId, depotId),
      };
    });
  }

  sendMail(request: SendMailRequest): Promise<SendMailResult> {
    return this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        request.deliveryKey,
      ]);
      const previous = await client.query<DeliveryRow & { recipient_name: string }>(
        `SELECT delivery.delivery_kind, delivery.recipient_character_id,
           delivery.return_character_id, delivery.item_id,
           delivery.original_item_id, delivery.status,
           recipient.display_name AS recipient_name
         FROM inbox_deliveries delivery
         JOIN characters recipient ON recipient.id = delivery.recipient_character_id
         WHERE delivery.delivery_key = $1`,
        [request.deliveryKey],
      );
      const existing = previous.rows[0];
      if (existing) {
        if (
          existing.delivery_kind !== "mail" ||
          existing.return_character_id !== request.senderCharacterId
        ) {
          throw new Error("mail delivery key was reused with different ownership");
        }
        return {
          status: "committed",
          mutation: { after: [] },
          recipientName: existing.recipient_name,
          idempotent: true,
        };
      }
      const recipient = await client.query<{ id: string; display_name: string }>(
        `SELECT id, display_name
         FROM characters
         WHERE normalized_name = $1`,
        [request.normalizedRecipientName],
      );
      const recipientRow = recipient.rows[0];
      if (!recipientRow) {
        throw new TransactionRollback<SendMailResult>({
          status: "recipient-not-found",
        });
      }
      if (recipientRow.id === request.senderCharacterId) {
        throw new TransactionRollback<SendMailResult>({
          status: "invalid-recipient",
        });
      }
      await client.query(
        `SELECT id FROM characters
         WHERE id = ANY($1::uuid[])
         ORDER BY id FOR UPDATE`,
        [[request.senderCharacterId, recipientRow.id].sort()],
      );
      await this.ensureStorageState(client, recipientRow.id);
      const storage = await client.query<StorageStateRow>(
        `SELECT inbox_revision, stash_revision
         FROM character_storage_state
         WHERE character_id = $1 FOR UPDATE`,
        [recipientRow.id],
      );
      if (!storage.rows[0]) throw new Error("recipient storage state is missing");
      const row = await this.lockItem(client, request.itemId);
      if (!row || row.version !== request.itemRevision) {
        throw new TransactionRollback<SendMailResult>({ status: "not-owned" });
      }
      if (
        row.location_type !== "inventory" &&
        row.location_type !== "container"
      ) {
        throw new TransactionRollback<SendMailResult>({ status: "not-owned" });
      }
      const type = this.catalog.require(row.item_type_id);
      if (!type.pickupable || !type.movable) {
        throw new TransactionRollback<SendMailResult>({ status: "not-owned" });
      }
      const root = await this.ownershipRoot(client, row.id);
      if (
        !root ||
        root.character_id !== request.senderCharacterId ||
        !["equipment", "inventory"].includes(root.location_type)
      ) {
        throw new TransactionRollback<SendMailResult>({ status: "not-owned" });
      }
      const subtree = await this.lockSubtree(client, row.id);
      const recipientInboxCount = await this.heldItemCount(
        client,
        recipientRow.id,
        "inbox",
      );
      if (recipientInboxCount + subtree.length > DEPOT_LIMITS.maxInboxItems) {
        throw new TransactionRollback<SendMailResult>({ status: "inbox-full" });
      }
      const slot = await this.firstFreeSlot(
        client,
        recipientRow.id,
        "inbox",
        DEPOT_LIMITS.maxInboxItems,
      );
      if (slot === null) {
        throw new TransactionRollback<SendMailResult>({ status: "inbox-full" });
      }
      const before = itemFromRow(row);
      const updated = await client.query<DepotItemRow>(
        `UPDATE items
         SET location_type = 'inbox', character_id = $2, slot_index = $3,
             depot_id = null, container_id = null, equipment_slot = null,
             world_map_name = null, world_x = null, world_y = null,
             world_z = null, world_stack_index = null,
             version = version + 1, updated_at = now()
         WHERE id = $1
         RETURNING ${ITEM_COLUMNS}`,
        [row.id, recipientRow.id, slot],
      );
      const after = this.requireItem(updated.rows[0]);
      await client.query(
        `INSERT INTO inbox_deliveries (
           delivery_key, delivery_kind, recipient_character_id,
           return_character_id, item_id, original_item_id, expires_at
         ) VALUES ($1, 'mail', $2, $3, $4, $4, $5)`,
        [
          request.deliveryKey,
          recipientRow.id,
          request.senderCharacterId,
          row.id,
          request.expiresAt,
        ],
      );
      await client.query(
        `UPDATE character_storage_state
         SET inbox_revision = inbox_revision + 1, updated_at = now()
         WHERE character_id = $1`,
        [recipientRow.id],
      );
      await this.auditTransfer(
        client,
        request.senderCharacterId,
        before,
        after,
        "mail-delivery",
      );
      return {
        status: "committed",
        mutation: { before, after: [after] },
        recipientName: recipientRow.display_name,
        idempotent: false,
      };
    });
  }

  deliverReward(
    request: RewardDeliveryRequest,
  ): Promise<RewardDeliveryResult> {
    return this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        request.deliveryKey,
      ]);
      const previous = await client.query<DeliveryRow>(
        `SELECT delivery_kind, recipient_character_id, return_character_id,
           item_id, original_item_id, status
         FROM inbox_deliveries
         WHERE delivery_key = $1`,
        [request.deliveryKey],
      );
      const existing = previous.rows[0];
      if (existing) {
        if (
          existing.delivery_kind !== "reward" ||
          existing.recipient_character_id !== request.recipientCharacterId
        ) {
          throw new Error("reward delivery key was reused with different ownership");
        }
        return { itemId: existing.original_item_id, idempotent: true };
      }
      const type = this.catalog.require(request.itemTypeId);
      if (
        !type.pickupable ||
        !Number.isInteger(request.count) ||
        request.count < 1 ||
        request.count > type.maxCount
      ) {
        throw new Error("invalid reward delivery item");
      }
      const attributes = request.attributes ?? {};
      const encodedAttributes = JSON.stringify(attributes);
      if (encodedAttributes.length > 4_096 || Array.isArray(attributes)) {
        throw new Error("invalid reward delivery attributes");
      }
      const recipient = await client.query<{ id: string }>(
        "SELECT id FROM characters WHERE id = $1 FOR UPDATE",
        [request.recipientCharacterId],
      );
      if (!recipient.rows[0]) throw new Error("reward recipient not found");
      await this.ensureStorageState(client, request.recipientCharacterId);
      await client.query(
        `SELECT character_id FROM character_storage_state
         WHERE character_id = $1 FOR UPDATE`,
        [request.recipientCharacterId],
      );
      const inboxCount = await this.heldItemCount(
        client,
        request.recipientCharacterId,
        "inbox",
      );
      if (inboxCount >= DEPOT_LIMITS.maxInboxItems) {
        throw new Error("recipient inbox is full");
      }
      const slot = await this.firstFreeSlot(
        client,
        request.recipientCharacterId,
        "inbox",
        DEPOT_LIMITS.maxInboxItems,
      );
      if (slot === null) throw new Error("recipient inbox is full");
      const itemId = randomUUID();
      await client.query(
        `INSERT INTO items (
           id, item_type_id, count, attributes, location_type,
           character_id, slot_index
         ) VALUES ($1, $2, $3, $4::jsonb, 'inbox', $5, $6)`,
        [
          itemId,
          request.itemTypeId,
          request.count,
          encodedAttributes,
          request.recipientCharacterId,
          slot,
        ],
      );
      await client.query(
        `INSERT INTO inbox_deliveries (
           delivery_key, delivery_kind, recipient_character_id,
           item_id, original_item_id
         ) VALUES ($1, 'reward', $2, $3, $3)`,
        [request.deliveryKey, request.recipientCharacterId, itemId],
      );
      await client.query(
        `UPDATE character_storage_state
         SET inbox_revision = inbox_revision + 1, updated_at = now()
         WHERE character_id = $1`,
        [request.recipientCharacterId],
      );
      await client.query(
        `INSERT INTO audit_log(event_type, character_id, item_id, details)
         VALUES (
           'item-created', $1, $2,
           jsonb_build_object(
             'operation', 'reward-delivery', 'deliveryKey', $3::text,
             'itemTypeId', $4::integer, 'count', $5::integer
           )
         )`,
        [
          request.recipientCharacterId,
          itemId,
          request.deliveryKey,
          request.itemTypeId,
          request.count,
        ],
      );
      return { itemId, idempotent: false };
    });
  }

  async returnExpired(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<ExpiredDeliveryResult>> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("expired delivery batch is out of range");
    }
    const due = await this.pool.query<
      DeliveryRow & { delivery_key: string; expires_at: Date }
    >(
      `SELECT delivery_key, delivery_kind, recipient_character_id,
         return_character_id, item_id, original_item_id, status, expires_at
       FROM inbox_deliveries
       WHERE status = 'delivered' AND expires_at <= $1
       ORDER BY expires_at, delivery_key
       LIMIT $2`,
      [now, limit],
    );
    const returned: ExpiredDeliveryResult[] = [];
    for (const candidate of due.rows) {
      const result = await this.transaction(async (client) => {
        if (
          candidate.delivery_kind !== "mail" ||
          !candidate.return_character_id
        ) {
          return null;
        }
        const ids = [
          candidate.recipient_character_id,
          candidate.return_character_id,
        ].sort();
        await client.query(
          `SELECT id FROM characters
           WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
          [ids],
        );
        await this.ensureStorageState(client, candidate.recipient_character_id);
        await this.ensureStorageState(client, candidate.return_character_id);
        await client.query(
          `SELECT character_id FROM character_storage_state
           WHERE character_id = ANY($1::uuid[]) ORDER BY character_id FOR UPDATE`,
          [ids],
        );
        const itemRow = candidate.item_id
          ? await this.lockItem(client, candidate.item_id)
          : null;
        const locked = await client.query<
          DeliveryRow & { expires_at: Date }
        >(
          `SELECT delivery_kind, recipient_character_id,
             return_character_id, item_id, original_item_id, status, expires_at
           FROM inbox_deliveries
           WHERE delivery_key = $1
           FOR UPDATE`,
          [candidate.delivery_key],
        );
        const delivery = locked.rows[0];
        if (
          !delivery ||
          delivery.status !== "delivered" ||
          delivery.delivery_kind !== "mail" ||
          delivery.recipient_character_id !== candidate.recipient_character_id ||
          delivery.return_character_id !== candidate.return_character_id ||
          delivery.item_id !== candidate.item_id ||
          delivery.expires_at > now
        ) {
          return null;
        }
        if (
          !itemRow ||
          itemRow.location_type !== "inbox" ||
          itemRow.character_id !== delivery.recipient_character_id
        ) {
          await client.query(
            `UPDATE inbox_deliveries
             SET status = 'claimed', completed_at = $2
             WHERE delivery_key = $1`,
            [candidate.delivery_key, now],
          );
          return null;
        }
        const subtree = await this.lockSubtree(client, itemRow.id);
        const returnCount = await this.heldItemCount(
          client,
          delivery.return_character_id,
          "inbox",
        );
        const slot = await this.firstFreeSlot(
          client,
          delivery.return_character_id,
          "inbox",
          DEPOT_LIMITS.maxInboxItems,
        );
        if (
          slot === null ||
          returnCount + subtree.length > DEPOT_LIMITS.maxInboxItems
        ) {
          await client.query(
            `UPDATE inbox_deliveries
             SET expires_at = $2::timestamptz + interval '1 day'
             WHERE delivery_key = $1`,
            [candidate.delivery_key, now],
          );
          return null;
        }
        const before = itemFromRow(itemRow);
        const moved = await client.query<DepotItemRow>(
          `UPDATE items
           SET character_id = $2, slot_index = $3,
               version = version + 1, updated_at = $4
           WHERE id = $1
           RETURNING ${ITEM_COLUMNS}`,
          [itemRow.id, delivery.return_character_id, slot, now],
        );
        const after = this.requireItem(moved.rows[0]);
        await client.query(
          `UPDATE character_storage_state
           SET inbox_revision = inbox_revision + 1, updated_at = $2
           WHERE character_id = ANY($1::uuid[])`,
          [ids, now],
        );
        await client.query(
          `UPDATE inbox_deliveries
           SET status = 'returned', completed_at = $2
           WHERE delivery_key = $1`,
          [candidate.delivery_key, now],
        );
        await this.auditTransfer(
          client,
          delivery.return_character_id,
          before,
          after,
          "inbox-return",
        );
        return {
          itemId: itemRow.id,
          recipientCharacterId: delivery.recipient_character_id,
          returnCharacterId: delivery.return_character_id,
        };
      });
      if (result) returned.push(result);
    }
    return returned;
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (cause) {
      await client.query("ROLLBACK");
      if (cause instanceof TransactionRollback) return cause.result as T;
      throw cause;
    } finally {
      client.release();
    }
  }

  private async lockMetadata(
    client: PoolClient,
    characterId: string,
    depotId: number,
  ): Promise<{
    depotRevision: number;
    inboxRevision: number;
    stashRevision: number;
    depotCount: number;
  }> {
    if (!Number.isInteger(depotId) || depotId < 1 || depotId > 65_535) {
      throw new Error("depot id is out of range");
    }
    const character = await client.query<{ id: string }>(
      "SELECT id FROM characters WHERE id = $1 FOR UPDATE",
      [characterId],
    );
    if (!character.rows[0]) throw new Error("character not found");
    await client.query(
      `INSERT INTO character_depots (character_id, depot_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [characterId, depotId],
    );
    await this.ensureStorageState(client, characterId);
    const depot = await client.query<DepotStateRow>(
      `SELECT revision FROM character_depots
       WHERE character_id = $1 AND depot_id = $2 FOR UPDATE`,
      [characterId, depotId],
    );
    const storage = await client.query<StorageStateRow>(
      `SELECT inbox_revision, stash_revision
       FROM character_storage_state
       WHERE character_id = $1 FOR UPDATE`,
      [characterId],
    );
    const depotRow = depot.rows[0];
    const storageRow = storage.rows[0];
    if (!depotRow || !storageRow) throw new Error("storage metadata is missing");
    return {
      depotRevision: depotRow.revision,
      inboxRevision: storageRow.inbox_revision,
      stashRevision: storageRow.stash_revision,
      depotCount: await this.heldItemCount(client, characterId, "depot", depotId),
    };
  }

  private async ensureStorageState(
    client: PoolClient,
    characterId: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO character_storage_state (character_id)
       VALUES ($1) ON CONFLICT DO NOTHING`,
      [characterId],
    );
  }

  private async snapshot(
    client: PoolClient,
    characterId: string,
    depotId: number,
  ): Promise<DepotSnapshot> {
    const depot = await client.query<DepotStateRow>(
      `SELECT revision FROM character_depots
       WHERE character_id = $1 AND depot_id = $2`,
      [characterId, depotId],
    );
    const storage = await client.query<StorageStateRow>(
      `SELECT inbox_revision, stash_revision
       FROM character_storage_state WHERE character_id = $1`,
      [characterId],
    );
    const depotRow = depot.rows[0];
    const storageRow = storage.rows[0];
    if (!depotRow || !storageRow) throw new Error("storage metadata is missing");
    const stash = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM supply_stash WHERE character_id = $1`,
      [characterId],
    );
    return {
      depotRevision: depotRow.revision,
      inboxRevision: storageRow.inbox_revision,
      stashRevision: storageRow.stash_revision,
      depotCount: await this.heldItemCount(client, characterId, "depot", depotId),
      inboxCount: await this.heldItemCount(client, characterId, "inbox"),
      stashCount: Number(stash.rows[0]?.count ?? 0),
    };
  }

  private async browseItems(
    client: PoolClient,
    characterId: string,
    depotId: number,
    location: "depot" | "inbox",
    page: number,
    matchingItemTypeIds: ReadonlyArray<number> | null,
    snapshot: DepotSnapshot,
  ): Promise<DepotPage> {
    if (matchingItemTypeIds?.length === 0) {
      return { snapshot, totalEntries: 0, entries: [] };
    }
    const rootPredicate =
      location === "depot"
        ? "root.location_type = 'depot' AND root.character_id = $1 AND root.depot_id = $2"
        : "root.location_type = 'inbox' AND root.character_id = $1 AND $2::integer = $2::integer";
    const searchPredicate =
      matchingItemTypeIds === null
        ? "depth = 0 AND cardinality($3::integer[]) >= 0"
        : "item_type_id = ANY($3::integer[])";
    const parameters = [
      characterId,
      depotId,
      matchingItemTypeIds ?? [],
    ];
    const common = `WITH RECURSIVE located AS (
      SELECT root.*, 0 AS depth
      FROM items root
      WHERE ${rootPredicate}
      UNION ALL
      SELECT child.*, located.depth + 1
      FROM items child
      JOIN located ON child.container_id = located.id
      WHERE child.location_type IN ('container', 'corpse')
        AND located.depth < 8
    )`;
    const total = await client.query<{ count: string }>(
      `${common}
       SELECT count(*)::text AS count FROM located WHERE ${searchPredicate}`,
      parameters,
    );
    const totalEntries = Number(total.rows[0]?.count ?? 0);
    const offset = (page - 1) * DEPOT_LIMITS.pageSize;
    const selected = await client.query<DepotItemRow>(
      `${common}
       SELECT ${ITEM_COLUMNS}
       FROM located
       WHERE ${searchPredicate}
       ORDER BY item_type_id, slot_index, id
       LIMIT $4 OFFSET $5`,
      [...parameters, DEPOT_LIMITS.pageSize, offset],
    );
    const containedCounts = await this.containedCounts(
      client,
      selected.rows.map((row) => row.id),
    );
    const entries: DepotItemRecord[] = selected.rows.map((row) => {
      if (row.slot_index === null) {
        throw new Error(`stored item ${row.id} has no slot`);
      }
      return {
        location,
        slot: row.slot_index,
        item: itemFromRow(row),
        containedItemCount: containedCounts.get(row.id) ?? 0,
      };
    });
    return { snapshot, totalEntries, entries };
  }

  private async browseStash(
    client: PoolClient,
    characterId: string,
    page: number,
    matchingItemTypeIds: ReadonlyArray<number> | null,
    snapshot: DepotSnapshot,
  ): Promise<DepotPage> {
    if (matchingItemTypeIds?.length === 0) {
      return { snapshot, totalEntries: 0, entries: [] };
    }
    const predicate =
      matchingItemTypeIds === null
        ? "character_id = $1 AND cardinality($2::integer[]) >= 0"
        : "character_id = $1 AND item_type_id = ANY($2::integer[])";
    const parameters = [characterId, matchingItemTypeIds ?? []];
    const total = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM supply_stash WHERE ${predicate}`,
      parameters,
    );
    const rows = await client.query<{ item_type_id: number; count: string }>(
      `SELECT item_type_id, count::text AS count
       FROM supply_stash
       WHERE ${predicate}
       ORDER BY item_type_id
       LIMIT $3 OFFSET $4`,
      [
        ...parameters,
        DEPOT_LIMITS.pageSize,
        (page - 1) * DEPOT_LIMITS.pageSize,
      ],
    );
    return {
      snapshot,
      totalEntries: Number(total.rows[0]?.count ?? 0),
      entries: rows.rows.map((row) => ({
        location: "stash" as const,
        itemTypeId: row.item_type_id,
        count: Number(row.count),
      })),
    };
  }

  private async containedCounts(
    client: PoolClient,
    itemIds: ReadonlyArray<string>,
  ): Promise<ReadonlyMap<string, number>> {
    if (itemIds.length === 0) return new Map();
    const result = await client.query<{ root_id: string; count: string }>(
      `WITH RECURSIVE descendants AS (
         SELECT roots.id AS root_id, roots.id
         FROM items roots WHERE roots.id = ANY($1::uuid[])
         UNION ALL
         SELECT descendants.root_id, child.id
         FROM items child
         JOIN descendants ON child.container_id = descendants.id
         WHERE child.location_type IN ('container', 'corpse')
       )
       SELECT root_id, (count(*) - 1)::text AS count
       FROM descendants GROUP BY root_id`,
      [itemIds],
    );
    return new Map(result.rows.map((row) => [row.root_id, Number(row.count)]));
  }

  private async heldItemCount(
    client: PoolClient,
    characterId: string,
    location: "depot" | "inbox",
    depotId?: number,
  ): Promise<number> {
    const rootPredicate =
      location === "depot"
        ? "root.location_type = 'depot' AND root.character_id = $1 AND root.depot_id = $2"
        : "root.location_type = 'inbox' AND root.character_id = $1 AND $2::integer IS NULL";
    const result = await client.query<{ count: string }>(
      `WITH RECURSIVE held AS (
         SELECT root.id, 1 AS depth
         FROM items root WHERE ${rootPredicate}
         UNION ALL
         SELECT child.id, held.depth + 1
         FROM items child JOIN held ON child.container_id = held.id
         WHERE child.location_type IN ('container', 'corpse')
           AND held.depth < 8
       )
       SELECT count(*)::text AS count FROM held`,
      [characterId, depotId ?? null],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  private async lockItem(
    client: PoolClient,
    itemId: string,
  ): Promise<DepotItemRow | null> {
    const result = await client.query<DepotItemRow>(
      `SELECT ${ITEM_COLUMNS} FROM items WHERE id = $1 FOR UPDATE`,
      [itemId],
    );
    return result.rows[0] ?? null;
  }

  private async ownershipRoot(
    client: PoolClient,
    itemId: string,
  ): Promise<DepotItemRow | null> {
    const result = await client.query<DepotItemRow>(
      `WITH RECURSIVE ancestry AS (
         SELECT item.*, 0 AS depth FROM items item WHERE item.id = $1
         UNION ALL
         SELECT parent.*, ancestry.depth + 1
         FROM items parent
         JOIN ancestry ON parent.id = ancestry.container_id
         WHERE ancestry.depth < 8
       )
       SELECT ${ITEM_COLUMNS}
       FROM ancestry
       WHERE character_id IS NOT NULL
       ORDER BY depth DESC
       LIMIT 1`,
      [itemId],
    );
    return result.rows[0] ?? null;
  }

  private async lockSubtree(
    client: PoolClient,
    itemId: string,
  ): Promise<DepotItemRow[]> {
    const result = await client.query<DepotItemRow>(
      `WITH RECURSIVE descendants AS (
         SELECT id, 0 AS depth FROM items WHERE id = $1
         UNION ALL
         SELECT child.id, descendants.depth + 1
         FROM items child
         JOIN descendants ON child.container_id = descendants.id
         WHERE child.location_type IN ('container', 'corpse')
           AND descendants.depth < 8
       )
       SELECT ${ITEM_COLUMNS}
       FROM items
       WHERE id IN (SELECT id FROM descendants)
       ORDER BY id
       FOR UPDATE`,
      [itemId],
    );
    if (result.rows.length === 0) throw new Error("item subtree is missing");
    return result.rows;
  }

  private async loadCarriedItems(
    client: PoolClient,
    characterId: string,
  ): Promise<DepotItemRow[]> {
    const result = await client.query<DepotItemRow>(
      `WITH RECURSIVE carried AS (
         SELECT root.*, 1 AS depth
         FROM items root
         WHERE root.character_id = $1
           AND root.location_type IN ('equipment', 'inventory')
         UNION ALL
         SELECT child.*, carried.depth + 1
         FROM items child
         JOIN carried ON child.container_id = carried.id
         WHERE child.location_type IN ('container', 'corpse')
           AND carried.depth < 8
       )
       SELECT ${ITEM_COLUMNS} FROM carried LIMIT 501`,
      [characterId],
    );
    if (result.rows.length > 500) throw new Error("character owns too many items");
    return result.rows;
  }

  private async lockInventoryDestinations(
    client: PoolClient,
    characterId: string,
    count: number,
  ): Promise<InventoryDestination[]> {
    const equipped = await client.query<{ id: string; item_type_id: number }>(
      `SELECT id, item_type_id FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
         AND equipment_slot = 'backpack'
       FOR UPDATE`,
      [characterId],
    );
    const backpack = equipped.rows[0];
    if (backpack) {
      const capacity = this.catalog.require(
        backpack.item_type_id,
      ).containerCapacity;
      if (capacity === undefined) {
        throw new Error("equipped backpack is not a container");
      }
      const occupied = await client.query<{ slot_index: number }>(
        `SELECT slot_index FROM items
         WHERE container_id = $1 AND location_type IN ('container', 'corpse')
         ORDER BY slot_index FOR UPDATE`,
        [backpack.id],
      );
      const slots = new Set(occupied.rows.map((row) => row.slot_index));
      return Array.from({ length: capacity }, (_, slot) => slot)
        .filter((slot) => !slots.has(slot))
        .slice(0, count)
        .map((slot) => ({
          kind: "container" as const,
          containerId: backpack.id,
          slot,
        }));
    }
    const occupied = await client.query<{ slot_index: number }>(
      `SELECT slot_index FROM items
       WHERE character_id = $1 AND location_type = 'inventory'
       ORDER BY slot_index FOR UPDATE`,
      [characterId],
    );
    const slots = new Set(occupied.rows.map((row) => row.slot_index));
    return Array.from({ length: 100 }, (_, slot) => slot)
      .filter((slot) => !slots.has(slot))
      .slice(0, count)
      .map((slot) => ({ kind: "inventory" as const, characterId, slot }));
  }

  private async firstFreeSlot(
    client: PoolClient,
    characterId: string,
    location: "depot" | "inbox" | "inventory",
    capacity: number,
    depotId?: number,
  ): Promise<number | null> {
    const result = await client.query<{ slot: number }>(
      `SELECT candidate.slot
       FROM generate_series(0, $3 - 1) AS candidate(slot)
       WHERE NOT EXISTS (
         SELECT 1 FROM items existing
         WHERE existing.character_id = $1
           AND existing.location_type = $2
           AND existing.slot_index = candidate.slot
           AND ($4::integer IS NULL OR existing.depot_id = $4)
       )
       ORDER BY candidate.slot
       LIMIT 1`,
      [characterId, location, capacity, depotId ?? null],
    );
    return result.rows[0]?.slot ?? null;
  }

  private weightOf(rows: ReadonlyArray<DepotItemRow>): number {
    return rows.reduce(
      (total, row) =>
        total + this.catalog.require(row.item_type_id).weight * row.count,
      0,
    );
  }

  private async auditMerge(
    client: PoolClient,
    characterId: string,
    survivor: Item,
    sourceItemId: string,
    movedCount: number,
    sourceRemaining: number,
    operation: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-merged', $1, $2,
         jsonb_build_object(
           'sourceItemId', $3::text, 'movedCount', $4::integer,
           'sourceRemaining', $5::integer, 'resultCount', $6::integer,
           'operation', $7::text
         )
       )`,
      [
        characterId,
        survivor.id,
        sourceItemId,
        movedCount,
        sourceRemaining,
        survivor.count,
        operation,
      ],
    );
  }

  private async auditTransfer(
    client: PoolClient,
    characterId: string,
    before: Item,
    after: Item,
    operation: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_log(event_type, character_id, item_id, details)
       VALUES (
         'item-transferred', $1, $2,
         jsonb_build_object(
           'operation', $3::text, 'before', $4::jsonb, 'after', $5::jsonb
         )
       )`,
      [
        characterId,
        before.id,
        operation,
        JSON.stringify(before.location),
        JSON.stringify(after.location),
      ],
    );
  }

  private requireItem(row: DepotItemRow | undefined): Item {
    if (!row) throw new Error("item operation returned no row");
    return itemFromRow(row);
  }
}
