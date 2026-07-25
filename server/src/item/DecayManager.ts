import type { Position } from "@tibia/protocol";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import type { ItemMutation } from "./ItemMutation";

export interface DecayRecord {
  /** Persisted item id used for the store transaction. */
  readonly itemId: string;
  /** Map instance id (seed key for materialized map items). */
  readonly instanceId: string;
  readonly typeId: number;
  readonly version: number;
  readonly position: Position;
  readonly deadlineAt: number;
}

/**
 * A decaying item inside a character's inventory or equipment — an equipped
 * ring burning down, a torch in a backpack. Canary pauses these by keeping the
 * duration on the *active* item type only: de-equipping transforms the ring
 * back to a type with no duration, which drops its record here.
 */
export interface CarriedDecayRecord {
  readonly itemId: string;
  readonly characterId: string;
  readonly typeId: number;
  readonly version: number;
  readonly deadlineAt: number;
}

/**
 * Tick-owned bookkeeping for world-item decay deadlines. It never mutates
 * game state itself: the tick collects due records and the item pipeline
 * executes them through the store.
 *
 * Restart semantics: the schedule lives in memory, but the clock it runs on is
 * durable. A persisted item's decay started when its row was last written, so
 * `observeLoaded` resumes each boot deadline from the row's age instead of
 * granting a fresh full duration: an item whose duration elapsed while the
 * server was down is due immediately, and one that was halfway through resumes
 * with its remaining time. A transform still can never run twice — execution
 * is version-guarded at both the world re-check and the store transaction.
 */
export class DecayManager {
  private readonly records = new Map<string, DecayRecord>();
  private readonly carriedRecords = new Map<string, CarriedDecayRecord>();
  private earliestCarriedDeadlineAt = Number.POSITIVE_INFINITY;
  /**
   * Lower bound on the next due deadline so the per-tick check is O(1) when
   * nothing is due. Deletions may leave it stale (too low), which only costs
   * an occasional wasted scan, never a missed record.
   */
  private earliestDeadlineAt = Number.POSITIVE_INFINITY;

  constructor(
    private readonly catalog: ItemCatalog,
    private readonly maxDuePerTick = 16,
  ) {}

  get scheduledCount(): number {
    return this.records.size;
  }

  observeCreated(items: ReadonlyArray<Item>, now: number): void {
    for (const item of items) this.observeItem(item, now);
  }

  /**
   * Arms deadlines for a character's carried items. `agesMs` is how long each
   * row has been unchanged, so a ring keeps burning across a logout instead of
   * resetting its timer — the same durable-clock rule world decay uses. An
   * unknown id falls back to a full duration.
   */
  observeCarriedLoaded(
    characterId: string,
    items: ReadonlyArray<Item>,
    agesMs: ReadonlyMap<string, number> | undefined,
    now: number,
  ): void {
    for (const item of items) {
      const ageMs = agesMs?.get(item.id);
      const armedAt =
        ageMs !== undefined && Number.isFinite(ageMs) && ageMs >= 0
          ? now - ageMs
          : now;
      this.observeItem(item, armedAt, characterId);
    }
  }

  /** Drops every carried record for a character leaving the world. */
  forgetCarried(characterId: string): void {
    for (const [itemId, record] of this.carriedRecords) {
      if (record.characterId === characterId) this.carriedRecords.delete(itemId);
    }
  }

  /**
   * Arms boot deadlines for items loaded from the database. `agesMs` is how
   * long each row has been unchanged; subtracting it rewinds the arm time to
   * when the item last mutated, so the remaining duration survives the
   * restart. An unknown id (never persisted) falls back to a full duration.
   */
  observeLoaded(
    items: ReadonlyArray<Item>,
    agesMs: ReadonlyMap<string, number>,
    now: number,
  ): void {
    for (const item of items) {
      const ageMs = agesMs.get(item.id);
      const armedAt =
        ageMs !== undefined && Number.isFinite(ageMs) && ageMs >= 0
          ? now - ageMs
          : now;
      this.observeItem(item, armedAt);
    }
  }

  /**
   * Any mutation of an item resets its decay deadline to the full duration.
   * `characterId` marks a carried mutation: its items belong to that
   * character's inventory, which is what the carried schedule is keyed on.
   */
  observeMutation(
    mutation: ItemMutation,
    now: number,
    characterId?: string,
  ): void {
    if (mutation.before) {
      this.records.delete(mutation.before.id);
      this.carriedRecords.delete(mutation.before.id);
    }
    for (const removedId of mutation.removedItemIds ?? []) {
      this.records.delete(removedId);
      this.carriedRecords.delete(removedId);
    }
    for (const item of mutation.after) {
      this.observeItem(item, now, characterId);
    }
  }

  /** Re-arms a record whose execution failed; the world state is re-checked on the next attempt. */
  restore(record: DecayRecord, now: number): void {
    // A concurrent mutation may have scheduled a fresher record; never clobber it.
    if (this.records.has(record.itemId)) return;
    const durationSeconds =
      this.catalog.get(record.typeId)?.decay?.durationSeconds;
    if (durationSeconds === undefined) return;
    const deadlineAt = now + durationSeconds * 1_000;
    this.records.set(record.itemId, { ...record, deadlineAt });
    if (deadlineAt < this.earliestDeadlineAt) this.earliestDeadlineAt = deadlineAt;
  }

  /** Due records leave the schedule; only a later mutation re-adds an item. */
  collectDue(now: number): DecayRecord[] {
    if (this.records.size === 0) {
      this.earliestDeadlineAt = Number.POSITIVE_INFINITY;
      return [];
    }
    if (now < this.earliestDeadlineAt) return [];
    const due: DecayRecord[] = [];
    let nextEarliest = Number.POSITIVE_INFINITY;
    let truncated = false;
    for (const record of this.records.values()) {
      if (record.deadlineAt > now) {
        if (record.deadlineAt < nextEarliest) nextEarliest = record.deadlineAt;
        continue;
      }
      due.push(record);
      if (due.length >= this.maxDuePerTick) {
        truncated = true;
        break;
      }
    }
    for (const record of due) this.records.delete(record.itemId);
    this.earliestDeadlineAt = truncated ? now : nextEarliest;
    return due;
  }

  /** Due carried records leave the schedule; a later mutation re-adds them. */
  collectDueCarried(now: number): CarriedDecayRecord[] {
    if (this.carriedRecords.size === 0) {
      this.earliestCarriedDeadlineAt = Number.POSITIVE_INFINITY;
      return [];
    }
    if (now < this.earliestCarriedDeadlineAt) return [];
    const due: CarriedDecayRecord[] = [];
    let nextEarliest = Number.POSITIVE_INFINITY;
    let truncated = false;
    for (const record of this.carriedRecords.values()) {
      if (record.deadlineAt > now) {
        if (record.deadlineAt < nextEarliest) nextEarliest = record.deadlineAt;
        continue;
      }
      due.push(record);
      if (due.length >= this.maxDuePerTick) {
        truncated = true;
        break;
      }
    }
    for (const record of due) this.carriedRecords.delete(record.itemId);
    this.earliestCarriedDeadlineAt = truncated ? now : nextEarliest;
    return due;
  }

  private observeItem(
    item: Item,
    armedAt: number,
    characterId?: string,
  ): void {
    if (item.location.kind !== "world") {
      this.records.delete(item.id);
      this.observeCarriedItem(item, armedAt, characterId);
      return;
    }
    this.carriedRecords.delete(item.id);
    const durationSeconds = this.catalog.get(item.typeId)?.decay
      ?.durationSeconds;
    if (durationSeconds === undefined) {
      this.records.delete(item.id);
      return;
    }
    const deadlineAt = armedAt + durationSeconds * 1_000;
    this.records.set(item.id, {
      itemId: item.id,
      instanceId: item.seedKey ?? item.id,
      typeId: item.typeId,
      version: item.version,
      position: item.location.position,
      deadlineAt,
    });
    if (deadlineAt < this.earliestDeadlineAt) this.earliestDeadlineAt = deadlineAt;
  }

  /**
   * Only items whose owner is known are tracked: the contents of a corpse or
   * a world chest live in a container too, and they decay with their root
   * rather than on their own schedule.
   */
  private observeCarriedItem(
    item: Item,
    armedAt: number,
    characterId: string | undefined,
  ): void {
    const durationSeconds = this.catalog.get(item.typeId)?.decay
      ?.durationSeconds;
    if (characterId === undefined || durationSeconds === undefined) {
      this.carriedRecords.delete(item.id);
      return;
    }
    const deadlineAt = armedAt + durationSeconds * 1_000;
    this.carriedRecords.set(item.id, {
      itemId: item.id,
      characterId,
      typeId: item.typeId,
      version: item.version,
      deadlineAt,
    });
    if (deadlineAt < this.earliestCarriedDeadlineAt) {
      this.earliestCarriedDeadlineAt = deadlineAt;
    }
  }
}
