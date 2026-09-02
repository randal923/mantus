import { rewardAuditInsert } from "../../depot/sql/rewardAuditInsert";
import { rewardDeliveryInsert } from "../../depot/sql/rewardDeliveryInsert";
import { TransactionRollback } from "../../economy/TransactionRollback";
import { BOUND_CONTAINER_TYPE_ID } from "../../item/boundContainerTypeId";
import type { StoreGrant } from "../storeCatalog";
import type { StorePurchasePersistPlan } from "../StorePurchasePlan";
import { deliverExpBoost } from "./deliverExpBoost";
import { deliverMount } from "./deliverMount";
import { deliverOutfit } from "./deliverOutfit";
import { deliverPreyWildcards } from "./deliverPreyWildcards";
import { deliverSlotUnlock } from "./deliverSlotUnlock";
import type { StoreDeliveryContext } from "./StoreDeliveryContext";

/** The whole carried tree shares one row budget; see ownedItemsQuery. */
const MAX_CARRIED_ITEMS = 500;

const carriedRowCountQuery = `WITH RECURSIVE owned AS (
         SELECT id FROM items WHERE character_id = $1
         UNION ALL
         SELECT child.id
         FROM items child JOIN owned parent ON child.container_id = parent.id
       )
       SELECT count(*)::int AS carried FROM owned`;

const ownsItemTypeQuery = `WITH RECURSIVE owned AS (
         SELECT id, item_type_id FROM items WHERE character_id = $1
         UNION ALL
         SELECT child.id, child.item_type_id
         FROM items child JOIN owned parent ON child.container_id = parent.id
       )
       SELECT 1 FROM owned WHERE item_type_id = $2 LIMIT 1`;

const boundRootInsert = `INSERT INTO items (
         id, item_type_id, count, location_type, character_id, equipment_slot
       ) VALUES ($1, $2, 1, 'equipment', $3, 'bound')`;

const boundChildInsert = `INSERT INTO items (
         id, item_type_id, count, attributes, location_type,
         container_id, slot_index
       ) VALUES ($1, $2, $3, $4::jsonb, 'container', $5, $6)`;

/**
 * Makes a memory-first delivery durable inside the purchase's persist
 * transaction. The non-item legs reuse the exact SQL of the legacy delivery
 * functions; a refusal they would have answered with (`already-owned`,
 * `limit-reached`, …) means memory approved what the database now denies, so
 * it surfaces as a thrown error — the transaction rolls back, the persist
 * lane poisons the character and the session is resynced from committed
 * state instead of drifting (charter rules 2 and 4).
 *
 * Item deliveries write the exact ids and slots the tick already injected
 * into the live inventory, so the durable rows can never land elsewhere.
 */
export async function persistStoreDelivery(
  context: StoreDeliveryContext,
  grant: StoreGrant,
  plan: StorePurchasePersistPlan,
): Promise<void> {
  if (
    grant.kind === "premium" ||
    grant.kind === "name-change" ||
    grant.kind === "sex-change"
  ) {
    return;
  }
  if (grant.kind === "outfit" || grant.kind === "outfit-addon") {
    await assertDelivered(() => deliverOutfit(context, grant));
    return;
  }
  if (grant.kind === "mount") {
    await assertDelivered(() => deliverMount(context, grant));
    return;
  }
  if (grant.kind === "prey-wildcard") {
    await assertDelivered(() => deliverPreyWildcards(context, grant));
    return;
  }
  if (grant.kind === "prey-slot" || grant.kind === "hunting-slot") {
    const slotKind = grant.kind;
    await assertDelivered(() => deliverSlotUnlock(context, slotKind));
    return;
  }
  if (grant.kind === "exp-boost") {
    await assertDelivered(() => deliverExpBoost(context));
    return;
  }

  const delivery = plan.boundDelivery;
  if (!delivery || delivery.rows.length === 0) {
    throw new Error("store persist: item offer without planned rows");
  }
  if (
    (grant.kind === "item" || grant.kind === "stackable") &&
    grant.unique
  ) {
    const owned = await context.client.query(ownsItemTypeQuery, [
      context.characterId,
      grant.itemTypeId,
    ]);
    if ((owned.rowCount ?? 0) > 0) {
      throw new Error("store persist: unique item already owned");
    }
  }
  const carried = await context.client.query<{ carried: number }>(
    carriedRowCountQuery,
    [context.characterId],
  );
  const carriedRows =
    (carried.rows[0]?.carried ?? 0) + (delivery.createBoundRoot ? 1 : 0);
  if (carriedRows + delivery.rows.length > MAX_CARRIED_ITEMS) {
    throw new Error("store persist: carried row budget exceeded");
  }
  if (delivery.createBoundRoot) {
    await context.client.query(boundRootInsert, [
      delivery.boundRootId,
      BOUND_CONTAINER_TYPE_ID,
      context.characterId,
    ]);
    await context.client.query(rewardAuditInsert, [
      context.characterId,
      delivery.boundRootId,
      `${context.requestKey}:bound-root`,
      BOUND_CONTAINER_TYPE_ID,
      1,
    ]);
  }
  for (const row of delivery.rows) {
    await context.client.query(boundChildInsert, [
      row.id,
      row.itemTypeId,
      row.count,
      JSON.stringify(row.attributes),
      delivery.boundRootId,
      row.slot,
    ]);
    await context.client.query(rewardDeliveryInsert, [
      row.deliveryKey,
      context.characterId,
      row.id,
    ]);
    await context.client.query(rewardAuditInsert, [
      context.characterId,
      row.id,
      row.deliveryKey,
      row.itemTypeId,
      row.count,
    ]);
  }
}

/**
 * Runs a legacy delivery leg as an assertion: the refusal it would answer a
 * requester with becomes a hard failure, because the requester was already
 * answered from memory.
 */
async function assertDelivered<T>(deliver: () => Promise<T>): Promise<void> {
  try {
    await deliver();
  } catch (cause) {
    if (cause instanceof TransactionRollback) {
      throw new Error(
        `store persist: delivery refused (${JSON.stringify(cause.result)})`,
      );
    }
    throw cause;
  }
}
