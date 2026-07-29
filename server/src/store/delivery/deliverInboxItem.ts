import { randomUUID } from "node:crypto";
import { DEPOT_LIMITS } from "@tibia/protocol";
import { DepotTxHelper } from "../../depot/DepotTxHelper";
import type { DepotItemRow } from "../../depot/DepotItemRow";
import { requireItem } from "../../depot/requireItem";
import { bumpInboxRevisionUpdate } from "../../depot/sql/bumpInboxRevisionUpdate";
import { rewardAuditInsert } from "../../depot/sql/rewardAuditInsert";
import { rewardDeliveryInsert } from "../../depot/sql/rewardDeliveryInsert";
import { rewardItemInsert } from "../../depot/sql/rewardItemInsert";
import { rewardStorageStateLockQuery } from "../../depot/sql/rewardStorageStateLockQuery";
import { TransactionRollback } from "../../economy/TransactionRollback";
import type { Item } from "../../item/Item";
import type { StoreDeliveryContext } from "./StoreDeliveryContext";

const depot = new DepotTxHelper();

/** Item types the character already holds anywhere, for unique-item offers. */
const ownedItemTypeQuery = `SELECT 1 FROM items
       WHERE character_id = $1 AND item_type_id = $2
       LIMIT 1`;

/**
 * Delivers a purchased item to the buyer's inbox — Canary's store inbox.
 *
 * A stackable count larger than one stack becomes several rows, all created
 * here, in this transaction: a delivery that runs out of inbox slots halfway
 * rolls back the coin debit with it rather than charging for a partial
 * delivery (charter rule 2).
 *
 * Unique products (Canary's ITEM_UNIQUE, e.g. the Gold Pouch) re-check
 * ownership here rather than trusting the greyed-out button.
 */
export async function deliverInboxItem(
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
      },
): Promise<{ items: Item[] }> {
  const type = context.catalog.require(grant.itemTypeId);
  if (!type.pickupable) throw new Error("store product is not pickupable");

  if (grant.kind !== "charges" && grant.unique) {
    const owned = await context.client.query(ownedItemTypeQuery, [
      context.characterId,
      grant.itemTypeId,
    ]);
    if (owned.rowCount) {
      throw new TransactionRollback({ status: "already-owned" as const });
    }
  }

  // One row per stack: charges are a single charged item, a stackable count
  // splits across `maxCount`, a plain item is one row.
  const stacks =
    grant.kind === "charges"
      ? [{ count: 1, attributes: { charges: grant.charges } }]
      : splitIntoStacks(grant.count, type.maxCount).map((count) => ({
          count,
          attributes: {},
        }));

  await depot.ensureStorageState(context.client, context.characterId);
  await context.client.query(rewardStorageStateLockQuery, [context.characterId]);

  const items: Item[] = [];
  for (const [index, stack] of stacks.entries()) {
    const slot = await depot.firstFreeSlot(
      context.client,
      context.characterId,
      "inbox",
      DEPOT_LIMITS.maxInboxItems,
    );
    if (slot === null) {
      throw new TransactionRollback({ status: "inbox-full" as const });
    }
    const itemId = randomUUID();
    // Each stack carries its own delivery key, so the whole purchase stays
    // idempotent even when it produced several rows.
    const deliveryKey = stacks.length === 1
      ? context.requestKey
      : `${context.requestKey}:${index}`;
    const inserted = await context.client.query<DepotItemRow>(rewardItemInsert, [
      itemId,
      grant.itemTypeId,
      stack.count,
      JSON.stringify(stack.attributes),
      context.characterId,
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
      grant.itemTypeId,
      stack.count,
    ]);
    items.push(requireItem(inserted.rows[0]));
  }
  await context.client.query(bumpInboxRevisionUpdate, [context.characterId]);
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
