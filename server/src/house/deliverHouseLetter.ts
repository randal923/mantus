import { randomUUID } from "node:crypto";
import { DEPOT_LIMITS } from "@tibia/protocol";
import type { PoolClient } from "pg";
import type { DeliveryRow } from "../depot/DeliveryRow";
import type { DepotItemRow } from "../depot/DepotItemRow";
import type { DepotTxHelper } from "../depot/DepotTxHelper";
import { requireItem } from "../depot/requireItem";
import { bumpInboxRevisionUpdate } from "../depot/sql/bumpInboxRevisionUpdate";
import { deliveryAdvisoryLock } from "../depot/sql/deliveryAdvisoryLock";
import { rewardAuditInsert } from "../depot/sql/rewardAuditInsert";
import { rewardDeliveryByKeyQuery } from "../depot/sql/rewardDeliveryByKeyQuery";
import { rewardDeliveryInsert } from "../depot/sql/rewardDeliveryInsert";
import { rewardItemInsert } from "../depot/sql/rewardItemInsert";
import { rewardStorageStateLockQuery } from "../depot/sql/rewardStorageStateLockQuery";
import type { Item } from "../item/Item";

/** Canary's ITEM_LETTER_STAMPED, the item rent warnings arrive on. */
export const STAMPED_LETTER_TYPE_ID = 3506;

/**
 * Mails one stamped letter into a character's inbox inside the caller's open
 * transaction, under the same idempotent delivery key used by every other
 * inbox delivery. A replayed or retried caller observes the existing key and
 * writes nothing, so a crash between the rent charge and its commit can never
 * produce two letters for the same warning.
 *
 * A full inbox is not an error here: the letter is a courtesy notice, and the
 * server message the owner also receives carries the same information. The
 * caller gets null and the rest of its transaction stands.
 */
export async function deliverHouseLetter(
  client: PoolClient,
  helper: DepotTxHelper,
  input: {
    readonly deliveryKey: string;
    readonly recipientCharacterId: string;
    readonly text: string;
  },
): Promise<Item | null> {
  await client.query(deliveryAdvisoryLock, [input.deliveryKey]);
  const previous = await client.query<DeliveryRow>(rewardDeliveryByKeyQuery, [
    input.deliveryKey,
  ]);
  if (previous.rows[0]) return null;
  await helper.ensureStorageState(client, input.recipientCharacterId);
  await client.query(rewardStorageStateLockQuery, [
    input.recipientCharacterId,
  ]);
  const slot = await helper.firstFreeSlot(
    client,
    input.recipientCharacterId,
    "inbox",
    DEPOT_LIMITS.maxInboxItems,
  );
  if (slot === null) return null;
  const itemId = randomUUID();
  const inserted = await client.query<DepotItemRow>(rewardItemInsert, [
    itemId,
    STAMPED_LETTER_TYPE_ID,
    1,
    JSON.stringify({ text: input.text }),
    input.recipientCharacterId,
    slot,
  ]);
  await client.query(rewardDeliveryInsert, [
    input.deliveryKey,
    input.recipientCharacterId,
    itemId,
  ]);
  await client.query(bumpInboxRevisionUpdate, [input.recipientCharacterId]);
  await client.query(rewardAuditInsert, [
    input.recipientCharacterId,
    itemId,
    input.deliveryKey,
    STAMPED_LETTER_TYPE_ID,
    1,
  ]);
  return requireItem(inserted.rows[0]);
}
