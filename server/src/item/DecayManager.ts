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
 * Tick-owned bookkeeping for world-item decay deadlines. It never mutates
 * game state itself: the tick collects due records and the item pipeline
 * executes them through the store.
 *
 * Restart semantics: deadlines live in memory only. After a restart every
 * persisted world item with decay metadata is rescheduled with its full
 * duration when the world deltas load, so a transform can happen later than
 * originally scheduled but never earlier and never twice — execution is
 * version-guarded at both the world re-check and the store transaction.
 */
export class DecayManager {
  private readonly records = new Map<string, DecayRecord>();

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

  /** Any mutation of an item resets its decay deadline to the full duration. */
  observeMutation(mutation: ItemMutation, now: number): void {
    if (mutation.before) this.records.delete(mutation.before.id);
    for (const removedId of mutation.removedItemIds ?? []) {
      this.records.delete(removedId);
    }
    for (const item of mutation.after) this.observeItem(item, now);
  }

  /** Re-arms a record whose execution failed; the world state is re-checked on the next attempt. */
  restore(record: DecayRecord, now: number): void {
    // A concurrent mutation may have scheduled a fresher record; never clobber it.
    if (this.records.has(record.itemId)) return;
    const durationSeconds =
      this.catalog.get(record.typeId)?.decay?.durationSeconds;
    if (durationSeconds === undefined) return;
    this.records.set(record.itemId, {
      ...record,
      deadlineAt: now + durationSeconds * 1_000,
    });
  }

  /** Due records leave the schedule; only a later mutation re-adds an item. */
  collectDue(now: number): DecayRecord[] {
    const due: DecayRecord[] = [];
    for (const record of this.records.values()) {
      if (record.deadlineAt > now) continue;
      due.push(record);
      if (due.length >= this.maxDuePerTick) break;
    }
    for (const record of due) this.records.delete(record.itemId);
    return due;
  }

  private observeItem(item: Item, now: number): void {
    if (item.location.kind !== "world") {
      this.records.delete(item.id);
      return;
    }
    const durationSeconds = this.catalog.get(item.typeId)?.decay
      ?.durationSeconds;
    if (durationSeconds === undefined) {
      this.records.delete(item.id);
      return;
    }
    this.records.set(item.id, {
      itemId: item.id,
      instanceId: item.seedKey ?? item.id,
      typeId: item.typeId,
      version: item.version,
      position: item.location.position,
      deadlineAt: now + durationSeconds * 1_000,
    });
  }
}
