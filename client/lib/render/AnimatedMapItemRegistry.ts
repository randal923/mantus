import type { TibiaObject } from "./AssetStore";
import type { ItemAnimationSchedule } from "./getItemAnimationSchedule";
import { getItemAnimationSchedule } from "./getItemAnimationSchedule";
import { getSynchronizedItemPhase } from "./getSynchronizedItemPhase";
import { ItemAnimator } from "./ItemAnimator";

export interface AnimatedMapItemRegistration {
  id: string;
  floor: number;
  appearance: TibiaObject;
  instanceSeed: number;
  applyPhase: (phase: number) => void;
}

interface AnimatedMapItemEntry {
  readonly id: string;
  readonly floor: number;
  readonly clientId: number;
  readonly schedule: ItemAnimationSchedule;
  readonly applyPhase: (phase: number) => void;
  /** null for synchronized schedules: those read the shared clock instead. */
  readonly animator: ItemAnimator | null;
  phase: number;
  /** Synchronized entries only: time left before the next phase boundary. */
  remainingMs: number;
}

interface DetachedAnimator {
  readonly clientId: number;
  readonly animator: ItemAnimator;
  readonly detachedAtMs: number;
}

/**
 * A tile is torn down and rebuilt whenever anything on it changes, and every
 * item on it re-registers. Asynchronous animations run from the moment the item
 * appeared, so re-registering must not restart them — dropping a coin beside a
 * brazier would visibly reset the flame. Their state is parked for this long and
 * adopted again by the same instance id.
 */
const RETAIN_DETACHED_MS = 10_000;
const MAX_DETACHED = 4_096;

/** Advances only animated items currently registered in visible map windows. */
export class AnimatedMapItemRegistry {
  private readonly entries = new Map<string, AnimatedMapItemEntry>();
  private readonly entriesByFloor = new Map<number, Set<string>>();
  /** Insertion-ordered, so purging walks the oldest entries only. */
  private readonly detached = new Map<string, DetachedAnimator>();
  private visibleFloors = new Set<number>();
  private clockMs = 0;

  get size(): number {
    return this.entries.size;
  }

  get activeSize(): number {
    let count = 0;
    for (const floor of this.visibleFloors) {
      count += this.entriesByFloor.get(floor)?.size ?? 0;
    }
    return count;
  }

  register(registration: AnimatedMapItemRegistration): void {
    this.unregister(registration.id);
    const { id, floor, appearance, instanceSeed, applyPhase } = registration;
    const schedule = getItemAnimationSchedule(appearance);
    if (!schedule) return;
    const animator = schedule.synchronized
      ? null
      : this.adoptAnimator(id, appearance.clientId, schedule, instanceSeed);
    const start = animator
      ? { phase: animator.phase, remainingMs: 0 }
      : getSynchronizedItemPhase(schedule, this.clockMs);
    applyPhase(start.phase);
    this.entries.set(id, {
      id,
      floor,
      clientId: appearance.clientId,
      schedule,
      applyPhase,
      animator,
      phase: start.phase,
      remainingMs: start.remainingMs,
    });
    const floorEntries = this.entriesByFloor.get(floor) ?? new Set<string>();
    floorEntries.add(id);
    this.entriesByFloor.set(floor, floorEntries);
  }

  unregister(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    const floorEntries = this.entriesByFloor.get(entry.floor);
    floorEntries?.delete(id);
    if (floorEntries?.size === 0) this.entriesByFloor.delete(entry.floor);
    // Spent animations are parked too: a platform that finished rising must not
    // rise again because something was dropped on its tile.
    if (!entry.animator) return;
    this.detached.set(id, {
      clientId: entry.clientId,
      animator: entry.animator,
      detachedAtMs: this.clockMs,
    });
    while (this.detached.size > MAX_DETACHED) {
      const oldest = this.detached.keys().next().value;
      if (oldest === undefined) break;
      this.detached.delete(oldest);
    }
  }

  setVisibleFloors(floors: Iterable<number>): void {
    const next = new Set(floors);
    // Synchronized entries read the shared clock, so one on a floor that was
    // hidden shows a stale phase until its next boundary; resolve it on reveal.
    for (const floor of next) {
      if (this.visibleFloors.has(floor)) continue;
      for (const id of this.entriesByFloor.get(floor) ?? []) {
        const entry = this.entries.get(id);
        if (entry && !entry.animator) this.refreshSynchronized(entry);
      }
    }
    this.visibleFloors = next;
  }

  tick(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.clockMs += deltaMs;
    this.purgeDetached();
    for (const floor of this.visibleFloors) {
      for (const id of this.entriesByFloor.get(floor) ?? []) {
        const entry = this.entries.get(id);
        if (!entry) continue;
        if (entry.animator) {
          if (!entry.animator.advance(deltaMs)) continue;
          entry.phase = entry.animator.phase;
          entry.applyPhase(entry.phase);
          continue;
        }
        entry.remainingMs -= deltaMs;
        if (entry.remainingMs > 0) continue;
        this.refreshSynchronized(entry);
      }
    }
  }

  clear(): void {
    this.entries.clear();
    this.entriesByFloor.clear();
    this.detached.clear();
    this.clockMs = 0;
  }

  private adoptAnimator(
    id: string,
    clientId: number,
    schedule: ItemAnimationSchedule,
    instanceSeed: number,
  ): ItemAnimator {
    const parked = this.detached.get(id);
    this.detached.delete(id);
    if (parked && parked.clientId === clientId) return parked.animator;
    return new ItemAnimator(schedule, instanceSeed);
  }

  private refreshSynchronized(entry: AnimatedMapItemEntry): void {
    const { phase, remainingMs } = getSynchronizedItemPhase(
      entry.schedule,
      this.clockMs,
    );
    entry.remainingMs = remainingMs;
    if (phase === entry.phase) return;
    entry.phase = phase;
    entry.applyPhase(phase);
  }

  private purgeDetached(): void {
    for (const [id, parked] of this.detached) {
      if (this.clockMs - parked.detachedAtMs <= RETAIN_DETACHED_MS) return;
      this.detached.delete(id);
    }
  }
}
