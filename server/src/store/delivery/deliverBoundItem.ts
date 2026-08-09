import { randomUUID } from "node:crypto";
import { MAX_CONTAINER_CAPACITY } from "@tibia/protocol";
import { rewardAuditInsert } from "../../depot/sql/rewardAuditInsert";
import { rewardDeliveryInsert } from "../../depot/sql/rewardDeliveryInsert";
import { TransactionRollback } from "../../economy/TransactionRollback";
import { BOUND_CONTAINER_TYPE_ID } from "../../item/boundContainerTypeId";
import { DECORATION_KIT_ITEM_ID } from "../../item/decorationKitItemId";
import type { Item } from "../../item/Item";
import { ownedItemsQuery } from "../../item/sql/ownedItemsQuery";
import type { StoreDeliveryContext } from "./StoreDeliveryContext";

/** The whole carried tree shares one row budget; see ownedItemsQuery. */
const MAX_CARRIED_ITEMS = 500;

/**
 * Every item type the character owns from any root, container children
 * included, so a unique re-check can never miss an item that sits inside the
 * bound container (or any other owned container).
 */
const ownedItemTypesRecursiveQuery = `WITH RECURSIVE owned AS (
         SELECT id, item_type_id FROM items WHERE character_id = $1
         UNION ALL
         SELECT child.id, child.item_type_id
         FROM items child JOIN owned parent ON child.container_id = parent.id
       )
       SELECT DISTINCT item_type_id FROM owned`;

const boundRootLockQuery = `SELECT id FROM items
       WHERE character_id = $1 AND location_type = 'equipment'
         AND equipment_slot = 'bound'
       FOR UPDATE`;

const boundChildrenLockQuery = `SELECT slot_index FROM items
       WHERE container_id = $1 AND location_type = 'container'
       ORDER BY slot_index
       FOR UPDATE`;

const boundRootInsert = `INSERT INTO items (
         id, item_type_id, count, location_type, character_id, equipment_slot
       ) VALUES ($1, $2, 1, 'equipment', $3, 'bound')`;

const boundChildInsert = `INSERT INTO items (
         id, item_type_id, count, attributes, location_type,
         container_id, slot_index
       ) VALUES ($1, $2, $3, $4::jsonb, 'container', $5, $6)`;

/**
 * Delivers a purchased item into the buyer's bound container, where the
 * store drops everything a character buys. The character row is already
 * locked by the purchase transaction; a missing bound container (a character
 * predating the backfill) is created here, Canary-style.
 *
 * A stackable count larger than one stack becomes several rows, all created
 * here, in this transaction: a delivery that runs out of carried-row budget
 * halfway rolls back the coin debit with it rather than charging for a
 * partial delivery (charter rule 2).
 *
 * Unique products re-check ownership against the full owned tree — bound
 * container children included — rather than trusting the greyed-out button.
 */
export async function deliverBoundItem(
  context: StoreDeliveryContext,
  grant:
    | {
        readonly kind: "item" | "stackable";
        readonly itemTypeId: number;
        readonly count: number;
        readonly unique: boolean;
      }
    | {
        readonly kind: "charges";
        readonly itemTypeId: number;
        readonly charges: number;
      }
    | {
        readonly kind: "house-item";
        readonly itemTypeId: number;
        readonly count: number;
      },
): Promise<{ items: Item[] }> {
  // House furniture is not carriable; what the buyer receives is a wrapped
  // decoration kit per piece, unwrapped later on an owned house tile.
  const deliveredTypeId =
    grant.kind === "house-item" ? DECORATION_KIT_ITEM_ID : grant.itemTypeId;
  const type = context.catalog.require(deliveredTypeId);
  if (!type.pickupable) throw new Error("store product is not pickupable");

  if (grant.kind !== "charges" && grant.kind !== "house-item" && grant.unique) {
    const owned = await context.client.query<{ item_type_id: number }>(
      ownedItemTypesRecursiveQuery,
      [context.characterId],
    );
    const alreadyOwned = owned.rows.some(
      (row) => row.item_type_id === grant.itemTypeId,
    );
    if (alreadyOwned) {
      throw new TransactionRollback({ status: "already-owned" as const });
    }
  }

  // One row per stack: charges are a single charged item, house furniture is
  // one kit per piece, a stackable count splits across `maxCount`, a plain
  // item is one row.
  const stacks =
    grant.kind === "charges"
      ? [{ count: 1, attributes: { charges: grant.charges } }]
      : grant.kind === "house-item"
        ? Array.from({ length: grant.count }, () => ({
            count: 1,
            attributes: {
              unwrapTo: grant.itemTypeId,
              description:
                "Unwrap it in your own house to create a " +
                `${context.catalog.require(grant.itemTypeId).name}.`,
            },
          }))
        : splitIntoStacks(grant.count, type.maxCount).map((count) => ({
            count,
            attributes: {},
          }));

  const boundRoot = await context.client.query<{ id: string }>(
    boundRootLockQuery,
    [context.characterId],
  );
  let boundId = boundRoot.rows[0]?.id;
  const carried = await context.client.query(ownedItemsQuery, [
    context.characterId,
  ]);
  let carriedRows = carried.rowCount ?? 0;
  if (!boundId) {
    boundId = randomUUID();
    await context.client.query(boundRootInsert, [
      boundId,
      BOUND_CONTAINER_TYPE_ID,
      context.characterId,
    ]);
    await context.client.query(rewardAuditInsert, [
      context.characterId,
      boundId,
      `${context.requestKey}:bound-root`,
      BOUND_CONTAINER_TYPE_ID,
      1,
    ]);
    carriedRows += 1;
  }
  if (carriedRows + stacks.length > MAX_CARRIED_ITEMS) {
    throw new TransactionRollback({ status: "inbox-full" as const });
  }

  const children = await context.client.query<{ slot_index: number }>(
    boundChildrenLockQuery,
    [boundId],
  );
  const capacity =
    context.catalog.require(BOUND_CONTAINER_TYPE_ID).containerCapacity ??
    MAX_CONTAINER_CAPACITY;
  const usedSlots = new Set(children.rows.map((row) => row.slot_index));
  const freeSlots: number[] = [];
  for (let slot = 0; slot < capacity && freeSlots.length < stacks.length; slot++) {
    if (!usedSlots.has(slot)) freeSlots.push(slot);
  }
  if (freeSlots.length < stacks.length) {
    throw new TransactionRollback({ status: "inbox-full" as const });
  }

  const items: Item[] = [];
  for (const [index, stack] of stacks.entries()) {
    const itemId = randomUUID();
    const slot = freeSlots[index]!;
    // Each stack carries its own delivery key, so the whole purchase stays
    // idempotent even when it produced several rows.
    const deliveryKey =
      stacks.length === 1 ? context.requestKey : `${context.requestKey}:${index}`;
    await context.client.query(boundChildInsert, [
      itemId,
      deliveredTypeId,
      stack.count,
      JSON.stringify(stack.attributes),
      boundId,
      slot,
    ]);
    await context.client.query(rewardDeliveryInsert, [
      deliveryKey,
      context.characterId,
      itemId,
    ]);
    await context.client.query(rewardAuditInsert, [
      context.characterId,
      itemId,
      deliveryKey,
      deliveredTypeId,
      stack.count,
    ]);
    items.push({
      id: itemId,
      typeId: deliveredTypeId,
      count: stack.count,
      attributes: stack.attributes,
      version: 1,
      location: { kind: "container", containerId: boundId, slot },
    });
  }
  return { items };
}

function splitIntoStacks(count: number, maxCount: number): number[] {
  const perStack = Math.max(1, maxCount);
  const stacks: number[] = [];
  let remaining = count;
  while (remaining > 0) {
    const size = Math.min(remaining, perStack);
    stacks.push(size);
    remaining -= size;
  }
  return stacks;
}
