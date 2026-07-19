import { randomUUID } from "node:crypto";
import type { Position } from "@tibia/protocol";
import { positionKey } from "../positionKey";
import type { Item } from "../item/Item";
import type {
  AbandonHouseResult,
  ChargeHouseRentResult,
  HouseAccessRecord,
  HouseEvictionDelivery,
  HouseSnapshot,
  HouseStore,
  PurchaseHouseResult,
  SetHouseAccessResult,
  TransferHouseResult,
} from "./HouseStore";

interface MemoryHouseRow {
  ownerCharacterId: string;
  tenancyId: string;
  paidUntilMs: number;
  rentWarnings: number;
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
  private readonly access = new Map<number, MemoryAccessRow[]>();
  private readonly worldItems = new Map<string, Item>();
  private readonly deliveredKeys = new Set<string>();
  private readonly inboxes = new Map<string, Item[]>();

  constructor(
    private readonly isMovable: (typeId: number) => boolean = () => true,
  ) {}

  registerCharacter(characterId: string, name: string): void {
    this.characterNames.set(characterId, name);
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
      if (row.ownerCharacterId === input.characterId) {
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
      tenancyId: randomUUID(),
      paidUntilMs: input.paidUntilMs,
      rentWarnings: 0,
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
      tenancyId: randomUUID(),
      paidUntilMs: input.paidUntilMs,
      rentWarnings: 0,
    });
    this.access.set(input.houseId, []);
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
  }): Promise<ChargeHouseRentResult> {
    const row = this.rows.get(input.houseId);
    if (!row || row.paidUntilMs > input.now.getTime()) {
      return { status: "skip" };
    }
    const balance = this.balanceOf(row.ownerCharacterId);
    if (balance >= input.rent) {
      this.balances.set(row.ownerCharacterId, balance - input.rent);
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
      return {
        status: "evicted",
        ownerCharacterId: row.ownerCharacterId,
        evicted,
      };
    }
    row.rentWarnings = warnings;
    row.paidUntilMs = input.now.getTime() + input.warningGraceMs;
    return { status: "warned", snapshot: this.snapshotOf(input.houseId)! };
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
      tenancyId: row.tenancyId,
      paidUntilMs: row.paidUntilMs,
      rentWarnings: row.rentWarnings,
      guests: records("guest"),
      subowners: records("subowner"),
    };
  }
}
