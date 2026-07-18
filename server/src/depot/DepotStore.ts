import type { Item } from "../item/Item";
import type { ItemMutation } from "../item/ItemMutation";
import type { DepotPersistPlan } from "./DepotPersistPlan";
import type { LoadedDepot } from "./LoadedDepot";

export interface DepotSnapshot {
  readonly depotRevision: number;
  readonly inboxRevision: number;
  readonly stashRevision: number;
  readonly depotCount: number;
  readonly inboxCount: number;
  readonly stashCount: number;
}

export interface DepotItemRecord {
  readonly location: "depot" | "inbox";
  readonly slot: number;
  readonly item: Item;
  readonly containedItemCount: number;
}

export interface StashItemRecord {
  readonly location: "stash";
  readonly itemTypeId: number;
  readonly count: number;
}

export interface DepotPage {
  readonly snapshot: DepotSnapshot;
  readonly totalEntries: number;
  readonly entries: ReadonlyArray<DepotItemRecord | StashItemRecord>;
}

export interface SendMailRequest {
  readonly deliveryKey: string;
  readonly senderCharacterId: string;
  readonly itemId: string;
  readonly itemRevision: number;
  readonly normalizedRecipientName: string;
  readonly expiresAt: Date;
}

export type SendMailResult =
  | {
      readonly status: "committed";
      readonly mutation: ItemMutation;
      readonly recipientCharacterId: string;
      readonly recipientName: string;
      /** Root plus contained items, as stored in the recipient's inbox. */
      readonly deliveredItems: ReadonlyArray<Item>;
      readonly idempotent: boolean;
    }
  | {
      readonly status:
        | "recipient-not-found"
        | "invalid-recipient"
        | "not-owned"
        | "inbox-full";
    };

export interface RewardDeliveryRequest {
  readonly deliveryKey: string;
  readonly recipientCharacterId: string;
  readonly itemTypeId: number;
  readonly count: number;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface RewardDeliveryResult {
  readonly itemId: string;
  readonly item: Item | null;
  readonly idempotent: boolean;
}

export interface ExpiredDeliveryResult {
  readonly itemId: string;
  readonly recipientCharacterId: string;
  readonly returnCharacterId: string;
  /** Every id of the returned subtree, removed from the recipient's inbox. */
  readonly removedItemIds: ReadonlyArray<string>;
  /** The subtree as stored in the sender's inbox after the return. */
  readonly items: ReadonlyArray<Item>;
}

export interface DepotStore {
  loadForCharacter(characterId: string): Promise<LoadedDepot>;
  persist(plan: DepotPersistPlan): Promise<void>;
  sendMail(request: SendMailRequest): Promise<SendMailResult>;
  deliverReward(request: RewardDeliveryRequest): Promise<RewardDeliveryResult>;
  returnExpired(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<ExpiredDeliveryResult>>;
}
