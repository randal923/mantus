import type { TibiaObject } from "./AssetStore";
import { getItemAnimationPhase } from "./getItemAnimationPhase";

export interface AnimatedMapItemRegistration {
  id: string;
  floor: number;
  appearance: TibiaObject;
  instanceSeed: number;
  applyPhase: (phase: number) => void;
}

interface AnimatedMapItemEntry extends AnimatedMapItemRegistration {
  phase: number;
}

/** Advances only animated items currently registered in visible map windows. */
export class AnimatedMapItemRegistry {
  private readonly entries = new Map<string, AnimatedMapItemEntry>();
  private readonly entriesByFloor = new Map<number, Set<string>>();
  private visibleFloors = new Set<number>();
  private elapsedMs = 0;

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
    const phase = getItemAnimationPhase(
      registration.appearance,
      this.elapsedMs,
      registration.instanceSeed,
    );
    registration.applyPhase(phase);
    this.entries.set(registration.id, { ...registration, phase });
    const floorEntries = this.entriesByFloor.get(registration.floor) ?? new Set<string>();
    floorEntries.add(registration.id);
    this.entriesByFloor.set(registration.floor, floorEntries);
  }

  unregister(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    const floorEntries = this.entriesByFloor.get(entry.floor);
    floorEntries?.delete(id);
    if (floorEntries?.size === 0) this.entriesByFloor.delete(entry.floor);
  }

  setVisibleFloors(floors: Iterable<number>): void {
    this.visibleFloors = new Set(floors);
  }

  tick(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.elapsedMs += deltaMs;
    for (const floor of this.visibleFloors) {
      for (const id of this.entriesByFloor.get(floor) ?? []) {
        const entry = this.entries.get(id);
        if (!entry) continue;
        const phase = getItemAnimationPhase(
          entry.appearance,
          this.elapsedMs,
          entry.instanceSeed,
        );
        if (phase === entry.phase) continue;
        entry.phase = phase;
        entry.applyPhase(phase);
      }
    }
  }

  clear(): void {
    this.entries.clear();
    this.entriesByFloor.clear();
    this.elapsedMs = 0;
  }
}
