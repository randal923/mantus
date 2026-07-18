import { randomUUID } from "node:crypto";
import { DEPOT_LIMITS } from "@tibia/protocol";
import type { Pool } from "pg";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { DeliveryRow } from "./DeliveryRow";
import type { RewardDeliveryRequest, RewardDeliveryResult } from "./DepotStore";
import type { DepotTxHelper } from "./DepotTxHelper";
import { runSerializableTransaction } from "./runSerializableTransaction";
import { bumpInboxRevisionUpdate } from "./sql/bumpInboxRevisionUpdate";
import { deliveryAdvisoryLock } from "./sql/deliveryAdvisoryLock";
import { lockCharacterQuery } from "./sql/lockCharacterQuery";
import { rewardAuditInsert } from "./sql/rewardAuditInsert";
import { rewardDeliveryByKeyQuery } from "./sql/rewardDeliveryByKeyQuery";
import { rewardDeliveryInsert } from "./sql/rewardDeliveryInsert";
import { rewardItemInsert } from "./sql/rewardItemInsert";
import { rewardStorageStateLockQuery } from "./sql/rewardStorageStateLockQuery";

export class DepotRewardOps {
  constructor(
    private readonly pool: Pool,
    private readonly catalog: ItemCatalog,
    private readonly helper: DepotTxHelper,
  ) {}

  deliverReward(
    request: RewardDeliveryRequest,
  ): Promise<RewardDeliveryResult> {
    return runSerializableTransaction(this.pool, async (client) => {
      await client.query(deliveryAdvisoryLock, [request.deliveryKey]);
      const previous = await client.query<DeliveryRow>(
        rewardDeliveryByKeyQuery,
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
      const recipient = await client.query<{ id: string }>(lockCharacterQuery, [
        request.recipientCharacterId,
      ]);
      if (!recipient.rows[0]) throw new Error("reward recipient not found");
      await this.helper.ensureStorageState(client, request.recipientCharacterId);
      await client.query(rewardStorageStateLockQuery, [
        request.recipientCharacterId,
      ]);
      const inboxCount = await this.helper.heldItemCount(
        client,
        request.recipientCharacterId,
        "inbox",
      );
      if (inboxCount >= DEPOT_LIMITS.maxInboxItems) {
        throw new Error("recipient inbox is full");
      }
      const slot = await this.helper.firstFreeSlot(
        client,
        request.recipientCharacterId,
        "inbox",
        DEPOT_LIMITS.maxInboxItems,
      );
      if (slot === null) throw new Error("recipient inbox is full");
      const itemId = randomUUID();
      await client.query(rewardItemInsert, [
        itemId,
        request.itemTypeId,
        request.count,
        encodedAttributes,
        request.recipientCharacterId,
        slot,
      ]);
      await client.query(rewardDeliveryInsert, [
        request.deliveryKey,
        request.recipientCharacterId,
        itemId,
      ]);
      await client.query(bumpInboxRevisionUpdate, [
        request.recipientCharacterId,
      ]);
      await client.query(rewardAuditInsert, [
        request.recipientCharacterId,
        itemId,
        request.deliveryKey,
        request.itemTypeId,
        request.count,
      ]);
      return { itemId, idempotent: false };
    });
  }
}
