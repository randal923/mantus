import type {
  HouseActionFailedReason,
  HouseListKind,
  Position,
} from "@tibia/protocol";
import type { Item } from "../item/Item";

export interface HouseAccessRecord {
  readonly characterId: string;
  readonly name: string;
}

/** One stored Canary text access list; `door` is set for door lists only. */
export interface HouseTextListRecord {
  readonly kind: HouseListKind;
  readonly body: string;
  readonly door?: Position;
}

/** One owned house's dynamic state; unowned houses have no snapshot. */
export interface HouseSnapshot {
  readonly houseId: number;
  readonly ownerCharacterId: string;
  readonly ownerName: string;
  /** Set for guildhalls: the guild that owns the hall and pays its rent. */
  readonly guildId: string | null;
  readonly tenancyId: string;
  readonly paidUntilMs: number;
  readonly rentWarnings: number;
  readonly guests: ReadonlyArray<HouseAccessRecord>;
  readonly subowners: ReadonlyArray<HouseAccessRecord>;
  readonly textLists: ReadonlyArray<HouseTextListRecord>;
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

/**
 * One running auction. `bid` is fully backed: the gold left the bidder's bank
 * in the transaction that accepted it, so the row doubles as the escrow
 * record and every close path either consumes it or refunds it.
 */
export interface HouseAuctionSnapshot {
  readonly houseId: number;
  readonly bidderCharacterId: string;
  readonly bidderName: string;
  readonly bid: number;
  readonly endsAtMs: number;
}

/** The outbid holder whose escrow was returned by the accepted bid. */
export interface HouseBidRefund {
  readonly characterId: string;
  readonly amount: number;
}

export interface HouseOpFailure {
  readonly status: "failed";
  readonly reason: HouseActionFailedReason;
}

export type PlaceHouseBidResult =
  | {
      readonly status: "bid";
      readonly auction: HouseAuctionSnapshot;
      readonly refunded: HouseBidRefund | null;
    }
  | HouseOpFailure;

export type CloseHouseAuctionResult =
  | {
      readonly status: "sold";
      readonly snapshot: HouseSnapshot;
      readonly auction: HouseAuctionSnapshot;
    }
  | {
      readonly status: "refunded";
      readonly auction: HouseAuctionSnapshot;
      readonly reason: "already-owned" | "level-too-low" | "premium-required" | "own-house-exists";
    }
  | { readonly status: "skip" };

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

export type SetHouseTextListResult =
  | { readonly status: "ok"; readonly snapshot: HouseSnapshot }
  | HouseOpFailure;

export type ChargeHouseRentResult =
  | { readonly status: "paid"; readonly snapshot: HouseSnapshot }
  | {
      readonly status: "warned";
      readonly snapshot: HouseSnapshot;
      /** The warning letter mailed with this warning; null when it did not fit. */
      readonly letter: Item | null;
    }
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
  /**
   * Buys a guildhall out of the guild balance. Guild leadership is re-read
   * inside the transaction — a character demoted since the intent was
   * enqueued cannot spend the guild's gold (charter rule 4) — and the debit
   * is the conditional guarded UPDATE, so racing withdrawals cannot overdraw.
   */
  purchaseGuildhall(input: {
    houseId: number;
    characterId: string;
    guildId: string;
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
  loadAuctions(): Promise<ReadonlyArray<HouseAuctionSnapshot>>;
  /**
   * Accepts one bid: escrows it from the bidder's bank and refunds the
   * standing bid to its holder, in one transaction that re-reads the house
   * ownership and the standing bid at execution time. The first accepted bid
   * opens the auction and stamps its close time.
   */
  placeBid(input: {
    houseId: number;
    characterId: string;
    amount: number;
    /** Opening bids must reach the house price. */
    minimumBid: number;
    /** Later bids must beat the standing bid by at least this much. */
    minIncrement: number;
    endsAtMs: number;
    now: Date;
  }): Promise<PlaceHouseBidResult>;
  /** Auction ids whose close time has passed, oldest first (read-only scan). */
  listDueAuctionIds(now: Date, limit: number): Promise<ReadonlyArray<number>>;
  /**
   * Settles one due auction inside its own transaction. The auction row is
   * the lease: it is deleted in the same transaction that inserts the
   * `houses` row, so a replay after a crash finds nothing and does nothing.
   * The winner's level, premium, and one-house eligibility are re-read from
   * database truth here, not trusted from bid time (charter rule 4); a winner
   * who no longer qualifies — or a house bought directly meanwhile — is
   * refunded in full.
   */
  closeAuction(input: {
    houseId: number;
    now: Date;
    paidUntilMs: number;
    buyLevel: number;
  }): Promise<CloseHouseAuctionResult>;
  /**
   * Replaces one text access list. Authorization is re-read inside the
   * transaction: owners edit every list, subowners only the guest and door
   * lists. An empty body deletes the row.
   */
  setTextList(input: {
    houseId: number;
    actorCharacterId: string;
    kind: HouseListKind;
    body: string;
    door?: Position;
    maxDoorLists: number;
  }): Promise<SetHouseTextListResult>;
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
    /**
     * Builds the rent-warning letter's text from the warnings still left.
     * Pure and synchronous — it runs inside the rent transaction.
     */
    warningLetterText: (warningsLeft: number) => string;
  }): Promise<ChargeHouseRentResult>;
}
