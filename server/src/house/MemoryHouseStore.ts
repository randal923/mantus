import { randomUUID } from "node:crypto";
import type { HouseListKind, Position } from "@tibia/protocol";
import { positionKey } from "../positionKey";
import { STAMPED_LETTER_TYPE_ID } from "./deliverHouseLetter";
import type { Item } from "../item/Item";
import type {
  AbandonHouseResult,
  ChargeHouseRentResult,
  CloseHouseAuctionResult,
  HouseAccessRecord,
  HouseAuctionSnapshot,
  HouseEvictionDelivery,
  HouseSnapshot,
  HouseStore,
  HouseTextListRecord,
  PlaceHouseBidResult,
  ProcessHouseAbsenceResult,
  PurchaseHouseResult,
  SetHouseAccessResult,
  SetHouseTextListResult,
  TransferHouseResult,
} from "./HouseStore";

const DAY_MS = 24 * 3600 * 1000;

interface MemoryHouseRow {
  ownerCharacterId: string;
  guildId: string | null;
  tenancyId: string;
  paidUntilMs: number;
  rentWarnings: number;
  /** The lastSeenAt the absence warning was mailed for; null before it. */
  absenceWarnedForMs: number | null;
}

interface MemoryAuctionRow {
  bidderCharacterId: string;
  bid: number;
  endsAtMs: number;
}

interface MemoryAccessRow {
  kind: "guest" | "subowner";
  characterId: string;
}

/**
 * In-memory HouseStore mirroring the Pg store's execution-time re-checks and
 * database-uniqueness semantics (one owner per house, one house per
 * character, tenancy-guarded deletes, idempotent per-item eviction delivery
 * keys), so service tests exercise the same failure and replay paths.
 */
export class MemoryHouseStore implements HouseStore {
  private readonly characterNames = new Map<string, string>();
  private readonly balances = new Map<string, number>();
  private readonly rows = new Map<number, MemoryHouseRow>();
  private readonly auctions = new Map<number, MemoryAuctionRow>();
  private readonly levels = new Map<string, number>();
  private readonly premiumUntil = new Map<string, number>();
  /** Absence anchor per character; absent entries are never absence-due. */
  private readonly lastSeen = new Map<string, number>();
  private readonly access = new Map<number, MemoryAccessRow[]>();
  private readonly textLists = new Map<number, HouseTextListRecord[]>();
  private readonly guildOwners = new Map<string, string>();
  private readonly guildBalances = new Map<string, number>();
  private readonly worldItems = new Map<string, Item>();
  private readonly deliveredKeys = new Set<string>();
  private readonly inboxes = new Map<string, Item[]>();

  constructor(
    private readonly isMovable: (typeId: number) => boolean = () => true,
  ) {}

  registerCharacter(
    characterId: string,
    name: string,
    eligibility?: {
      level?: number;
      premiumUntilMs?: number;
      lastSeenAtMs?: number;
    },
  ): void {
    this.characterNames.set(characterId, name);
    this.levels.set(characterId, eligibility?.level ?? 1_000);
    this.premiumUntil.set(
      characterId,
      eligibility?.premiumUntilMs ?? Number.MAX_SAFE_INTEGER,
    );
    if (eligibility?.lastSeenAtMs !== undefined) {
      this.lastSeen.set(characterId, eligibility.lastSeenAtMs);
    }
  }

  /** Mirrors the last durable save that maintains characters.last_seen_at. */
  setLastSeen(characterId: string, lastSeenAtMs: number): void {
    this.lastSeen.set(characterId, lastSeenAtMs);
  }

  setBalance(characterId: string, balance: number): void {
    this.balances.set(characterId, balance);
  }

  balanceOf(characterId: string): number {
    return this.balances.get(characterId) ?? 0;
  }

  registerWorldItem(item: Item): void {
    this.worldItems.set(item.id, item);
  }

  inboxOf(characterId: string): ReadonlyArray<Item> {
    return this.inboxes.get(characterId) ?? [];
  }

  async loadAll(): Promise<ReadonlyArray<HouseSnapshot>> {
    return [...this.rows.keys()].map((houseId) => this.snapshotOf(houseId)!);
  }

  async loadSnapshot(houseId: number): Promise<HouseSnapshot | null> {
    return this.snapshotOf(houseId);
  }

  async purchase(input: {
    houseId: number;
    characterId: string;
    price: number;
    paidUntilMs: number;
  }): Promise<PurchaseHouseResult> {
    if (this.rows.has(input.houseId)) {
      return { status: "failed", reason: "already-owned" };
    }
    for (const row of this.rows.values()) {
      // Mirrors the partial unique index: a guildhall does not count against
      // the leader's one personal house.
      if (row.guildId === null && row.ownerCharacterId === input.characterId) {
        return { status: "failed", reason: "own-house-exists" };
      }
    }
    const balance = this.balanceOf(input.characterId);
    if (balance < input.price) {
      return { status: "failed", reason: "insufficient-funds" };
    }
    this.balances.set(input.characterId, balance - input.price);
    this.rows.set(input.houseId, {
      ownerCharacterId: input.characterId,
      guildId: null,
      tenancyId: randomUUID(),
      paidUntilMs: input.paidUntilMs,
      rentWarnings: 0,
      absenceWarnedForMs: null,
    });
    this.access.set(input.houseId, []);
    return { status: "purchased", snapshot: this.snapshotOf(input.houseId)! };
  }

  registerGuild(guildId: string, ownerCharacterId: string, balance: number): void {
    this.guildOwners.set(guildId, ownerCharacterId);
    this.guildBalances.set(guildId, balance);
  }

  guildBalanceOf(guildId: string): number {
    return this.guildBalances.get(guildId) ?? 0;
  }

  async purchaseGuildhall(input: {
    houseId: number;
    characterId: string;
    guildId: string;
    price: number;
    paidUntilMs: number;
  }): Promise<PurchaseHouseResult> {
    if (this.rows.has(input.houseId)) {
      return { status: "failed", reason: "already-owned" };
    }
    if (this.guildOwners.get(input.guildId) !== input.characterId) {
      return { status: "failed", reason: "not-authorized" };
    }
    for (const row of this.rows.values()) {
      if (row.guildId === input.guildId) {
        return { status: "failed", reason: "own-house-exists" };
      }
    }
    const balance = this.guildBalanceOf(input.guildId);
    if (balance < input.price) {
      return { status: "failed", reason: "insufficient-funds" };
    }
    this.guildBalances.set(input.guildId, balance - input.price);
    this.rows.set(input.houseId, {
      ownerCharacterId: input.characterId,
      guildId: input.guildId,
      tenancyId: randomUUID(),
      paidUntilMs: input.paidUntilMs,
      rentWarnings: 0,
      absenceWarnedForMs: null,
    });
    this.access.set(input.houseId, []);
    return { status: "purchased", snapshot: this.snapshotOf(input.houseId)! };
  }

  async abandon(input: {
    houseId: number;
    ownerCharacterId: string;
    mapName: string;
    tilePositions: ReadonlyArray<Position>;
  }): Promise<AbandonHouseResult> {
    const row = this.rows.get(input.houseId);
    if (!row || row.ownerCharacterId !== input.ownerCharacterId) {
      return { status: "failed", reason: "not-owner" };
    }
    const evicted = this.evictItems(
      input.houseId,
      row.tenancyId,
      row.ownerCharacterId,
      input.tilePositions,
    );
    this.rows.delete(input.houseId);
    this.access.delete(input.houseId);
    this.textLists.delete(input.houseId);
    return { status: "abandoned", evicted };
  }

  async transfer(input: {
    houseId: number;
    fromCharacterId: string;
    toCharacterId: string;
    price: number;
    paidUntilMs: number;
    mapName: string;
    tilePositions: ReadonlyArray<Position>;
  }): Promise<TransferHouseResult> {
    const row = this.rows.get(input.houseId);
    if (!row || row.ownerCharacterId !== input.fromCharacterId) {
      return { status: "failed", reason: "not-owner" };
    }
    for (const [houseId, candidate] of this.rows) {
      if (
        houseId !== input.houseId &&
        candidate.ownerCharacterId === input.toCharacterId
      ) {
        return { status: "failed", reason: "target-has-house" };
      }
    }
    const buyerBalance = this.balanceOf(input.toCharacterId);
    if (buyerBalance < input.price) {
      return { status: "failed", reason: "insufficient-funds" };
    }
    const evicted = this.evictItems(
      input.houseId,
      row.tenancyId,
      input.fromCharacterId,
      input.tilePositions,
    );
    this.balances.set(input.toCharacterId, buyerBalance - input.price);
    this.balances.set(
      input.fromCharacterId,
      this.balanceOf(input.fromCharacterId) + input.price,
    );
    this.rows.set(input.houseId, {
      ownerCharacterId: input.toCharacterId,
      guildId: null,
      tenancyId: randomUUID(),
      paidUntilMs: input.paidUntilMs,
      rentWarnings: 0,
      absenceWarnedForMs: null,
    });
    this.access.set(input.houseId, []);
    this.textLists.delete(input.houseId);
    return {
      status: "transferred",
      snapshot: this.snapshotOf(input.houseId)!,
      evicted,
    };
  }

  async setAccess(input: {
    houseId: number;
    actorCharacterId: string;
    kind: "guest" | "subowner";
    targetName: string;
    grant: boolean;
    maxEntries: number;
  }): Promise<SetHouseAccessResult> {
    const row = this.rows.get(input.houseId);
    if (!row) return { status: "failed", reason: "not-found" };
    const entries = this.access.get(input.houseId) ?? [];
    if (row.ownerCharacterId !== input.actorCharacterId) {
      const isSubowner = entries.some(
        (entry) =>
          entry.kind === "subowner" &&
          entry.characterId === input.actorCharacterId,
      );
      if (!isSubowner || input.kind !== "guest") {
        return { status: "failed", reason: "not-authorized" };
      }
    }
    const target = [...this.characterNames.entries()].find(
      ([, name]) =>
        name.trim().toLowerCase() === input.targetName.trim().toLowerCase(),
    );
    if (!target) return { status: "failed", reason: "target-not-found" };
    const [targetId, targetName] = target;
    if (input.grant) {
      if (targetId === row.ownerCharacterId) {
        return { status: "failed", reason: "invalid-request" };
      }
      if (entries.length >= input.maxEntries) {
        return { status: "failed", reason: "access-limit" };
      }
      if (
        !entries.some(
          (entry) =>
            entry.kind === input.kind && entry.characterId === targetId,
        )
      ) {
        entries.push({ kind: input.kind, characterId: targetId });
      }
    } else {
      const index = entries.findIndex(
        (entry) => entry.kind === input.kind && entry.characterId === targetId,
      );
      if (index >= 0) entries.splice(index, 1);
    }
    this.access.set(input.houseId, entries);
    return {
      status: "ok",
      entry: { characterId: targetId, name: targetName },
      snapshot: this.snapshotOf(input.houseId)!,
    };
  }

  async setTextList(input: {
    houseId: number;
    actorCharacterId: string;
    kind: HouseListKind;
    body: string;
    door?: Position;
    maxDoorLists: number;
  }): Promise<SetHouseTextListResult> {
    const row = this.rows.get(input.houseId);
    if (!row) return { status: "failed", reason: "not-found" };
    if (row.ownerCharacterId !== input.actorCharacterId) {
      const isSubowner = (this.access.get(input.houseId) ?? []).some(
        (entry) =>
          entry.kind === "subowner" &&
          entry.characterId === input.actorCharacterId,
      );
      if (!isSubowner || input.kind === "subowner") {
        return { status: "failed", reason: "not-authorized" };
      }
    }
    const door = input.kind === "door" ? input.door : undefined;
    if (input.kind === "door" && !door) {
      return { status: "failed", reason: "not-a-door" };
    }
    const lists = this.textLists.get(input.houseId) ?? [];
    const sameSlot = (entry: HouseTextListRecord) =>
      entry.kind === input.kind &&
      (!door ||
        (entry.door?.x === door.x &&
          entry.door?.y === door.y &&
          entry.door?.z === door.z));
    const index = lists.findIndex(sameSlot);
    if (!input.body.trim()) {
      if (index >= 0) lists.splice(index, 1);
    } else if (index >= 0) {
      lists[index] = { kind: input.kind, body: input.body, ...(door ? { door } : {}) };
    } else {
      if (
        door &&
        lists.filter((entry) => entry.kind === "door").length >=
          input.maxDoorLists
      ) {
        return { status: "failed", reason: "access-limit" };
      }
      lists.push({ kind: input.kind, body: input.body, ...(door ? { door } : {}) });
    }
    this.textLists.set(input.houseId, lists);
    return { status: "ok", snapshot: this.snapshotOf(input.houseId)! };
  }

  async loadAuctions(): Promise<ReadonlyArray<HouseAuctionSnapshot>> {
    return [...this.auctions.keys()].map((houseId) =>
      this.auctionOf(houseId)!,
    );
  }

  async placeBid(input: {
    houseId: number;
    characterId: string;
    amount: number;
    minimumBid: number;
    minIncrement: number;
    endsAtMs: number;
    now: Date;
  }): Promise<PlaceHouseBidResult> {
    if (this.rows.has(input.houseId)) {
      return { status: "failed", reason: "already-owned" };
    }
    const previous = this.auctions.get(input.houseId);
    if (previous && previous.endsAtMs <= input.now.getTime()) {
      return { status: "failed", reason: "auction-closed" };
    }
    const floor = previous ? previous.bid + input.minIncrement : input.minimumBid;
    if (input.amount < floor) return { status: "failed", reason: "bid-too-low" };
    const escrow =
      previous?.bidderCharacterId === input.characterId
        ? input.amount - previous.bid
        : input.amount;
    const balance = this.balanceOf(input.characterId);
    if (balance < escrow) {
      return { status: "failed", reason: "insufficient-funds" };
    }
    this.balances.set(input.characterId, balance - escrow);
    let refunded: { characterId: string; amount: number } | null = null;
    if (previous && previous.bidderCharacterId !== input.characterId) {
      this.balances.set(
        previous.bidderCharacterId,
        this.balanceOf(previous.bidderCharacterId) + previous.bid,
      );
      refunded = {
        characterId: previous.bidderCharacterId,
        amount: previous.bid,
      };
    }
    this.auctions.set(input.houseId, {
      bidderCharacterId: input.characterId,
      bid: input.amount,
      endsAtMs: previous?.endsAtMs ?? input.endsAtMs,
    });
    return {
      status: "bid",
      auction: this.auctionOf(input.houseId)!,
      refunded,
    };
  }

  async listDueAuctionIds(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<number>> {
    return [...this.auctions.entries()]
      .filter(([, row]) => row.endsAtMs <= now.getTime())
      .sort((left, right) => left[1].endsAtMs - right[1].endsAtMs)
      .slice(0, limit)
      .map(([houseId]) => houseId);
  }

  async closeAuction(input: {
    houseId: number;
    now: Date;
    paidUntilMs: number;
    buyLevel: number;
  }): Promise<CloseHouseAuctionResult> {
    const row = this.auctions.get(input.houseId);
    if (!row || row.endsAtMs > input.now.getTime()) return { status: "skip" };
    const auction = this.auctionOf(input.houseId)!;
    const ownsHouse = [...this.rows.values()].some(
      (candidate) => candidate.ownerCharacterId === row.bidderCharacterId,
    );
    const blocked = this.rows.has(input.houseId)
      ? ("already-owned" as const)
      : ownsHouse
        ? ("own-house-exists" as const)
        : (this.levels.get(row.bidderCharacterId) ?? 1) < input.buyLevel
          ? ("level-too-low" as const)
          : (this.premiumUntil.get(row.bidderCharacterId) ?? 0) <=
              input.now.getTime()
            ? ("premium-required" as const)
            : null;
    this.auctions.delete(input.houseId);
    if (blocked) {
      this.balances.set(
        row.bidderCharacterId,
        this.balanceOf(row.bidderCharacterId) + row.bid,
      );
      return { status: "refunded", auction, reason: blocked };
    }
    this.rows.set(input.houseId, {
      ownerCharacterId: row.bidderCharacterId,
      guildId: null,
      tenancyId: randomUUID(),
      paidUntilMs: input.paidUntilMs,
      rentWarnings: 0,
      absenceWarnedForMs: null,
    });
    this.access.set(input.houseId, []);
    return {
      status: "sold",
      snapshot: this.snapshotOf(input.houseId)!,
      auction,
    };
  }

  async listDueHouseIds(
    now: Date,
    limit: number,
  ): Promise<ReadonlyArray<number>> {
    return [...this.rows.entries()]
      .filter(([, row]) => row.paidUntilMs <= now.getTime())
      .sort((left, right) => left[1].paidUntilMs - right[1].paidUntilMs)
      .slice(0, limit)
      .map(([houseId]) => houseId);
  }

  async chargeRent(input: {
    houseId: number;
    rent: number;
    now: Date;
    rentPeriodMs: number;
    warningGraceMs: number;
    maxWarnings: number;
    mapName: string;
    tilePositions: ReadonlyArray<Position>;
    warningLetterText: (warningsLeft: number) => string;
  }): Promise<ChargeHouseRentResult> {
    const row = this.rows.get(input.houseId);
    if (!row || row.paidUntilMs > input.now.getTime()) {
      return { status: "skip" };
    }
    // A guildhall's rent comes out of the guild balance.
    const balance = row.guildId
      ? this.guildBalanceOf(row.guildId)
      : this.balanceOf(row.ownerCharacterId);
    if (balance >= input.rent) {
      if (row.guildId) {
        this.guildBalances.set(row.guildId, balance - input.rent);
      } else {
        this.balances.set(row.ownerCharacterId, balance - input.rent);
      }
      row.paidUntilMs += input.rentPeriodMs;
      row.rentWarnings = 0;
      return { status: "paid", snapshot: this.snapshotOf(input.houseId)! };
    }
    const warnings = row.rentWarnings + 1;
    if (warnings >= input.maxWarnings) {
      const evicted = this.evictItems(
        input.houseId,
        row.tenancyId,
        row.ownerCharacterId,
        input.tilePositions,
      );
      this.rows.delete(input.houseId);
      this.access.delete(input.houseId);
      this.textLists.delete(input.houseId);
      return {
        status: "evicted",
        ownerCharacterId: row.ownerCharacterId,
        evicted,
      };
    }
    row.rentWarnings = warnings;
    row.paidUntilMs = input.now.getTime() + input.warningGraceMs;
    const key = `house-rent-letter:${input.houseId}:${row.tenancyId}:${warnings}`;
    let letter: Item | null = null;
    if (!this.deliveredKeys.has(key)) {
      this.deliveredKeys.add(key);
      const inbox = this.inboxes.get(row.ownerCharacterId) ?? [];
      letter = {
        id: randomUUID(),
        typeId: STAMPED_LETTER_TYPE_ID,
        count: 1,
        attributes: {
          text: input.warningLetterText(
            Math.max(input.maxWarnings - warnings, 0),
          ),
        },
        version: 1,
        location: {
          kind: "inbox",
          characterId: row.ownerCharacterId,
          slot: inbox.length,
        },
      };
      inbox.push(letter);
      this.inboxes.set(row.ownerCharacterId, inbox);
    }
    return {
      status: "warned",
      snapshot: this.snapshotOf(input.houseId)!,
      letter,
    };
  }

  async listAbsenceDueHouseIds(input: {
    now: Date;
    warnAfterDays: number;
    evictAfterDays: number;
    premiumEvictAfterDays: number;
    limit: number;
  }): Promise<ReadonlyArray<number>> {
    const nowMs = input.now.getTime();
    return [...this.rows.entries()]
      .filter(([, row]) => {
        if (row.guildId) return false;
        const lastSeenMs = this.lastSeen.get(row.ownerCharacterId);
        if (lastSeenMs === undefined) return false;
        const absenceMs = nowMs - lastSeenMs;
        if (absenceMs < input.warnAfterDays * DAY_MS) return false;
        if (row.absenceWarnedForMs !== lastSeenMs) return true;
        const premium =
          (this.premiumUntil.get(row.ownerCharacterId) ?? 0) > nowMs;
        const evictAfterDays = premium
          ? input.premiumEvictAfterDays
          : input.evictAfterDays;
        return absenceMs >= evictAfterDays * DAY_MS;
      })
      .sort(
        (left, right) =>
          (this.lastSeen.get(left[1].ownerCharacterId) ?? 0) -
          (this.lastSeen.get(right[1].ownerCharacterId) ?? 0),
      )
      .slice(0, input.limit)
      .map(([houseId]) => houseId);
  }

  async processAbsence(input: {
    houseId: number;
    now: Date;
    warnAfterDays: number;
    evictAfterDays: number;
    premiumEvictAfterDays: number;
    mapName: string;
    tilePositions: ReadonlyArray<Position>;
    warningLetterText: (daysLeft: number) => string;
  }): Promise<ProcessHouseAbsenceResult> {
    const row = this.rows.get(input.houseId);
    // Guildhalls never expire from absence.
    if (!row || row.guildId) return { status: "skip" };
    const lastSeenMs = this.lastSeen.get(row.ownerCharacterId);
    if (lastSeenMs === undefined) return { status: "skip" };
    const absenceMs = input.now.getTime() - lastSeenMs;
    const premium =
      (this.premiumUntil.get(row.ownerCharacterId) ?? 0) >
      input.now.getTime();
    const evictAfterDays = premium
      ? input.premiumEvictAfterDays
      : input.evictAfterDays;
    if (absenceMs >= evictAfterDays * DAY_MS) {
      const evicted = this.evictItems(
        input.houseId,
        row.tenancyId,
        row.ownerCharacterId,
        input.tilePositions,
      );
      this.rows.delete(input.houseId);
      this.access.delete(input.houseId);
      this.textLists.delete(input.houseId);
      return {
        status: "evicted",
        ownerCharacterId: row.ownerCharacterId,
        evicted,
      };
    }
    if (
      absenceMs < input.warnAfterDays * DAY_MS ||
      row.absenceWarnedForMs === lastSeenMs
    ) {
      return { status: "skip" };
    }
    row.absenceWarnedForMs = lastSeenMs;
    const key = `house-absence-letter:${input.houseId}:${row.tenancyId}:${lastSeenMs}`;
    let letter: Item | null = null;
    if (!this.deliveredKeys.has(key)) {
      this.deliveredKeys.add(key);
      const inbox = this.inboxes.get(row.ownerCharacterId) ?? [];
      letter = {
        id: randomUUID(),
        typeId: STAMPED_LETTER_TYPE_ID,
        count: 1,
        attributes: {
          text: input.warningLetterText(
            Math.max(evictAfterDays - Math.floor(absenceMs / DAY_MS), 0),
          ),
        },
        version: 1,
        location: {
          kind: "inbox",
          characterId: row.ownerCharacterId,
          slot: inbox.length,
        },
      };
      inbox.push(letter);
      this.inboxes.set(row.ownerCharacterId, inbox);
    }
    return {
      status: "warned",
      snapshot: this.snapshotOf(input.houseId)!,
      letter,
    };
  }

  private evictItems(
    houseId: number,
    tenancyId: string,
    recipientCharacterId: string,
    tilePositions: ReadonlyArray<Position>,
  ): HouseEvictionDelivery {
    const tiles = new Set(tilePositions.map((position) => positionKey(position)));
    const deliveredItems: Item[] = [];
    const removedItemIds: string[] = [];
    for (const item of [...this.worldItems.values()]) {
      if (item.location.kind !== "world") continue;
      if (!tiles.has(positionKey(item.location.position))) continue;
      if (!this.isMovable(item.typeId)) continue;
      const key = `house-evict:${houseId}:${tenancyId}:${item.id}`;
      if (this.deliveredKeys.has(key)) continue;
      this.deliveredKeys.add(key);
      this.worldItems.delete(item.id);
      const inbox = this.inboxes.get(recipientCharacterId) ?? [];
      const delivered: Item = {
        ...item,
        location: {
          kind: "inbox",
          characterId: recipientCharacterId,
          slot: inbox.length,
        },
      };
      inbox.push(delivered);
      this.inboxes.set(recipientCharacterId, inbox);
      deliveredItems.push(delivered);
      removedItemIds.push(item.id);
    }
    return {
      recipientCharacterId,
      deliveredItems,
      removedItemIds,
      leftBehind: 0,
    };
  }

  private auctionOf(houseId: number): HouseAuctionSnapshot | null {
    const row = this.auctions.get(houseId);
    if (!row) return null;
    return {
      houseId,
      bidderCharacterId: row.bidderCharacterId,
      bidderName: this.characterNames.get(row.bidderCharacterId) ?? "?",
      bid: row.bid,
      endsAtMs: row.endsAtMs,
    };
  }

  private snapshotOf(houseId: number): HouseSnapshot | null {
    const row = this.rows.get(houseId);
    if (!row) return null;
    const entries = this.access.get(houseId) ?? [];
    const records = (kind: "guest" | "subowner"): HouseAccessRecord[] =>
      entries
        .filter((entry) => entry.kind === kind)
        .map((entry) => ({
          characterId: entry.characterId,
          name: this.characterNames.get(entry.characterId) ?? "?",
        }));
    return {
      houseId,
      ownerCharacterId: row.ownerCharacterId,
      ownerName: this.characterNames.get(row.ownerCharacterId) ?? "?",
      guildId: row.guildId,
      tenancyId: row.tenancyId,
      paidUntilMs: row.paidUntilMs,
      rentWarnings: row.rentWarnings,
      guests: records("guest"),
      subowners: records("subowner"),
      textLists: [...(this.textLists.get(houseId) ?? [])],
    };
  }
}
