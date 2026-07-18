import { DEPOT_LIMITS } from "@tibia/protocol";
import type { Pool } from "pg";
import { TransactionRollback } from "../economy/TransactionRollback";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { DeliveryRow } from "./DeliveryRow";
import type { DepotItemRow } from "./DepotItemRow";
import type { SendMailRequest, SendMailResult } from "./DepotStore";
import type { DepotTxHelper } from "./DepotTxHelper";
import type { StorageStateRow } from "./StorageStateRow";
import { itemFromRow } from "./itemFromRow";
import { requireItem } from "./requireItem";
import { runSerializableTransaction } from "./runSerializableTransaction";
import { bumpInboxRevisionUpdate } from "./sql/bumpInboxRevisionUpdate";
import { characterByNormalizedNameQuery } from "./sql/characterByNormalizedNameQuery";
import { deliveryAdvisoryLock } from "./sql/deliveryAdvisoryLock";
import { lockMailCharactersQuery } from "./sql/lockMailCharactersQuery";
import { mailDeliveryByKeyQuery } from "./sql/mailDeliveryByKeyQuery";
import { mailDeliveryInsert } from "./sql/mailDeliveryInsert";
import { mailItemToInboxUpdate } from "./sql/mailItemToInboxUpdate";
import { mailStorageStateForUpdateQuery } from "./sql/mailStorageStateForUpdateQuery";

export class DepotMailOps {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly helper: DepotTxHelper,
  ) {}

  sendMail(request: SendMailRequest): Promise<SendMailResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      await client.query(deliveryAdvisoryLock, [request.deliveryKey]);
      const previous = await client.query<DeliveryRow & { recipient_name: string }>(
        mailDeliveryByKeyQuery,
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
        characterByNormalizedNameQuery,
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
      await client.query(lockMailCharactersQuery, [
        [request.senderCharacterId, recipientRow.id].sort(),
      ]);
      await this.helper.ensureStorageState(client, recipientRow.id);
      const storage = await client.query<StorageStateRow>(
        mailStorageStateForUpdateQuery,
        [recipientRow.id],
      );
      if (!storage.rows[0]) throw new Error("recipient storage state is missing");
      const row = await this.helper.lockItem(client, request.itemId);
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
      const root = await this.helper.ownershipRoot(client, row.id);
      if (
        !root ||
        root.character_id !== request.senderCharacterId ||
        !["equipment", "inventory"].includes(root.location_type)
      ) {
        throw new TransactionRollback<SendMailResult>({ status: "not-owned" });
      }
      const subtree = await this.helper.lockSubtree(client, row.id);
      const recipientInboxCount = await this.helper.heldItemCount(
        client,
        recipientRow.id,
        "inbox",
      );
      if (recipientInboxCount + subtree.length > DEPOT_LIMITS.maxInboxItems) {
        throw new TransactionRollback<SendMailResult>({ status: "inbox-full" });
      }
      const slot = await this.helper.firstFreeSlot(
        client,
        recipientRow.id,
        "inbox",
        DEPOT_LIMITS.maxInboxItems,
      );
      if (slot === null) {
        throw new TransactionRollback<SendMailResult>({ status: "inbox-full" });
      }
      const before = itemFromRow(row);
      const updated = await client.query<DepotItemRow>(mailItemToInboxUpdate, [
        row.id,
        recipientRow.id,
        slot,
      ]);
      const after = requireItem(updated.rows[0]);
      await client.query(mailDeliveryInsert, [
        request.deliveryKey,
        recipientRow.id,
        request.senderCharacterId,
        row.id,
        request.expiresAt,
      ]);
      await client.query(bumpInboxRevisionUpdate, [recipientRow.id]);
      await this.helper.auditTransfer(
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
}
