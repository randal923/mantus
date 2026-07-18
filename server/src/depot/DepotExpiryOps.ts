import { DEPOT_LIMITS } from "@tibia/protocol";
import type { Pool } from "pg";
import type { DeliveryRow } from "./DeliveryRow";
import type { ExpiredDeliveryResult } from "./DepotStore";
import type { DepotTxHelper } from "./DepotTxHelper";
import type { DepotItemRow } from "./DepotItemRow";
import { itemFromRow } from "./itemFromRow";
import { requireItem } from "./requireItem";
import { runSerializableTransaction } from "./runSerializableTransaction";
import { bumpExpiredInboxRevisionsUpdate } from "./sql/bumpExpiredInboxRevisionsUpdate";
import { deliveryForUpdateQuery } from "./sql/deliveryForUpdateQuery";
import { expiredCharactersLockQuery } from "./sql/expiredCharactersLockQuery";
import { expiredDeliveriesQuery } from "./sql/expiredDeliveriesQuery";
import { expiredStorageStatesLockQuery } from "./sql/expiredStorageStatesLockQuery";
import { extendDeliveryExpiryUpdate } from "./sql/extendDeliveryExpiryUpdate";
import { markDeliveryClaimedUpdate } from "./sql/markDeliveryClaimedUpdate";
import { markDeliveryReturnedUpdate } from "./sql/markDeliveryReturnedUpdate";
import { returnItemToSenderUpdate } from "./sql/returnItemToSenderUpdate";

export class DepotExpiryOps {
  constructor(
    private readonly pool: Pool,
    private readonly helper: DepotTxHelper,
  ) {}

  async returnExpired(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<ExpiredDeliveryResult>> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("expired delivery batch is out of range");
    }
    const due = await this.pool.query<
      DeliveryRow & { delivery_key: string; expires_at: Date }
    >(expiredDeliveriesQuery, [now, limit]);
    const returned: ExpiredDeliveryResult[] = [];
    for (const candidate of due.rows) {
      const result = await runSerializableTransaction(this.pool, async (client) => {
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
        await client.query(expiredCharactersLockQuery, [ids]);
        await this.helper.ensureStorageState(client, candidate.recipient_character_id);
        await this.helper.ensureStorageState(client, candidate.return_character_id);
        await client.query(expiredStorageStatesLockQuery, [ids]);
        const itemRow = candidate.item_id
          ? await this.helper.lockItem(client, candidate.item_id)
          : null;
        const locked = await client.query<
          DeliveryRow & { expires_at: Date }
        >(deliveryForUpdateQuery, [candidate.delivery_key]);
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
          await client.query(markDeliveryClaimedUpdate, [
            candidate.delivery_key,
            now,
          ]);
          return null;
        }
        const subtree = await this.helper.lockSubtree(client, itemRow.id);
        const returnCount = await this.helper.heldItemCount(
          client,
          delivery.return_character_id,
          "inbox",
        );
        const slot = await this.helper.firstFreeSlot(
          client,
          delivery.return_character_id,
          "inbox",
          DEPOT_LIMITS.maxInboxItems,
        );
        if (
          slot === null ||
          returnCount + subtree.length > DEPOT_LIMITS.maxInboxItems
        ) {
          await client.query(extendDeliveryExpiryUpdate, [
            candidate.delivery_key,
            now,
          ]);
          return null;
        }
        const before = itemFromRow(itemRow);
        const moved = await client.query<DepotItemRow>(
          returnItemToSenderUpdate,
          [itemRow.id, delivery.return_character_id, slot, now],
        );
        const after = requireItem(moved.rows[0]);
        await client.query(bumpExpiredInboxRevisionsUpdate, [ids, now]);
        await client.query(markDeliveryReturnedUpdate, [
          candidate.delivery_key,
          now,
        ]);
        await this.helper.auditTransfer(
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
}
