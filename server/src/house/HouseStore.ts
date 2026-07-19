import type { HouseActionFailedReason, Position } from "@tibia/protocol";
import type { Item } from "../item/Item";

export interface HouseAccessRecord {
  readonly characterId: string;
  readonly name: string;
}

/** One owned house's dynamic state; unowned houses have no snapshot. */
export interface HouseSnapshot {
  readonly houseId: number;
  readonly ownerCharacterId: string;
  readonly ownerName: string;
  readonly tenancyId: string;
  readonly paidUntilMs: number;
  readonly rentWarnings: number;
  readonly guests: ReadonlyArray<HouseAccessRecord>;
  readonly subowners: ReadonlyArray<HouseAccessRecord>;
}

/**
 * Items moved out of a house to the previous owner's inbox in the same
 * transaction that changed ownership. `removedItemIds` are the world roots
 * that left the map; `leftBehind` counts movable roots that did not fit the
 * inbox and stayed on the tiles.
 */
export interface HouseEvictionDelivery {
  readonly recipientCharacterId: string;
  readonly deliveredItems: ReadonlyArray<Item>;
  readonly removedItemIds: ReadonlyArray<string>;
  readonly leftBehind: number;
}

export interface HouseOpFailure {
  readonly status: "failed";
  readonly reason: HouseActionFailedReason;
}

export type PurchaseHouseResult =
  | { readonly status: "purchased"; readonly snapshot: HouseSnapshot }
  | HouseOpFailure;

export type AbandonHouseResult =
  | { readonly status: "abandoned"; readonly evicted: HouseEvictionDelivery }
  | HouseOpFailure;

export type TransferHouseResult =
  | {
      readonly status: "transferred";
      readonly snapshot: HouseSnapshot;
      readonly evicted: HouseEvictionDelivery;
    }
  | HouseOpFailure;

export type SetHouseAccessResult =
  | {
      readonly status: "ok";
      readonly entry: HouseAccessRecord;
      readonly snapshot: HouseSnapshot;
    }
  | HouseOpFailure;

export type ChargeHouseRentResult =
  | { readonly status: "paid"; readonly snapshot: HouseSnapshot }
  | { readonly status: "warned"; readonly snapshot: HouseSnapshot }
  | {
      readonly status: "evicted";
      readonly ownerCharacterId: string;
      readonly evicted: HouseEvictionDelivery;
    }
  | { readonly status: "skip" };

/**
 * Durable house storage. Every mutation is one ACID transaction that
 * re-verifies ownership and funds from database truth at execution time
 * (charter rules 2-4); ownership races resolve through the house_id primary
 * key and the unique owner index, money legs go through the shared bank
 * primitives, and item eviction moves each row exactly once under an
 * idempotent per-item delivery key.
 */
export interface HouseStore {
  loadAll(): Promise<ReadonlyArray<HouseSnapshot>>;
  loadSnapshot(houseId: number): Promise<HouseSnapshot | null>;
  purchase(input: {
    houseId: number;
    characterId: string;
    price: number;
    paidUntilMs: number;
  }): Promise<PurchaseHouseResult>;
  abandon(input: {
    houseId: number;
    ownerCharacterId: string;
    mapName: string;
    tilePositions: ReadonlyArray<Position>;
  }): Promise<AbandonHouseResult>;
  transfer(input: {
    houseId: number;
    fromCharacterId: string;
    toCharacterId: string;
    price: number;
    paidUntilMs: number;
    mapName: string;
    tilePositions: ReadonlyArray<Position>;
  }): Promise<TransferHouseResult>;
  setAccess(input: {
    houseId: number;
    actorCharacterId: string;
    kind: "guest" | "subowner";
    targetName: string;
    grant: boolean;
    maxEntries: number;
  }): Promise<SetHouseAccessResult>;
  /** House ids whose rent is due, oldest first (read-only scan). */
  listDueHouseIds(now: Date, limit: number): Promise<ReadonlyArray<number>>;
  /**
   * Charges one due rent inside its own transaction, guarded on the row's
   * current paid_until/warnings so replays and restarts never double-charge.
   * Insufficient funds add one warning and one day of grace; the final
   * warning evicts in the same transaction.
   */
  chargeRent(input: {
    houseId: number;
    rent: number;
    now: Date;
    rentPeriodMs: number;
    warningGraceMs: number;
    maxWarnings: number;
    mapName: string;
    tilePositions: ReadonlyArray<Position>;
  }): Promise<ChargeHouseRentResult>;
}
