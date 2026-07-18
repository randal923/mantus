import type { DepotLocation } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type { ItemMutation } from "../item/ItemMutation";

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

export type DepotTransferResult =
  | {
      readonly status: "committed";
      readonly mutation: ItemMutation;
      readonly snapshot: DepotSnapshot;
    }
  | {
      readonly status:
        | "stale"
        | "not-owned"
        | "invalid-item"
        | "depot-full"
        | "inbox-full"
        | "no-space"
        | "no-capacity";
    };

export type StashTransferResult =
  | {
      readonly status: "committed";
      readonly mutation: ItemMutation;
      readonly snapshot: DepotSnapshot;
    }
  | {
      readonly status:
        | "stale"
        | "not-owned"
        | "invalid-item"
        | "stash-only"
        | "no-space"
        | "no-capacity";
    };

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
      readonly recipientName: string;
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
  readonly idempotent: boolean;
}

export interface ExpiredDeliveryResult {
  readonly itemId: string;
  readonly recipientCharacterId: string;
  readonly returnCharacterId: string;
}

export interface DepotStore {
  browse(
    characterId: string,
    depotId: number,
    location: DepotLocation,
    page: number,
    matchingItemTypeIds: ReadonlyArray<number> | null,
  ): Promise<DepotPage>;
  deposit(
    characterId: string,
    depotId: number,
    expectedDepotRevision: number,
    itemId: string,
    expectedItemRevision: number,
  ): Promise<DepotTransferResult>;
  withdraw(
    characterId: string,
    depotId: number,
    source: "depot" | "inbox",
    expectedSourceRevision: number,
    itemId: string,
    expectedItemRevision: number,
    capacityMax: number,
  ): Promise<DepotTransferResult>;
  depositStash(
    characterId: string,
    depotId: number,
    expectedStashRevision: number,
    itemId: string,
    expectedItemRevision: number,
    count: number,
  ): Promise<StashTransferResult>;
  withdrawStash(
    characterId: string,
    depotId: number,
    expectedStashRevision: number,
    itemTypeId: number,
    count: number,
    capacityMax: number,
  ): Promise<StashTransferResult>;
  sendMail(request: SendMailRequest): Promise<SendMailResult>;
  deliverReward(request: RewardDeliveryRequest): Promise<RewardDeliveryResult>;
  returnExpired(now: Date, limit: number): Promise<ReadonlyArray<ExpiredDeliveryResult>>;
}
