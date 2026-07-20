import { WHEEL_LIMITS } from "@tibia/protocol";
import type { WheelStore } from "./WheelStore";

const emptySlices = (): number[] =>
  new Array<number>(WHEEL_LIMITS.sliceCount).fill(0);

/**
 * In-memory wheel allocations for online characters. Slices load once at
 * login and mutate only inside the tick (charter rules 3 and 5); each save
 * is persisted with an idempotent full-row upsert.
 */
export class WheelTracker {
  private readonly slicesByCharacter = new Map<string, number[]>();
  private readonly pendingWrites = new Set<Promise<void>>();

  constructor(private readonly store?: WheelStore) {}

  async load(characterId: string): Promise<ReadonlyArray<number>> {
    if (!this.store) return emptySlices();
    return this.store.loadSlices(characterId);
  }

  attach(characterId: string, slices: ReadonlyArray<number>): void {
    this.slicesByCharacter.set(characterId, [...slices]);
  }

  detachCharacter(characterId: string): void {
    this.slicesByCharacter.delete(characterId);
  }

  slicesFor(characterId: string): ReadonlyArray<number> {
    return this.slicesByCharacter.get(characterId) ?? emptySlices();
  }

  set(characterId: string, slices: ReadonlyArray<number>): void {
    this.slicesByCharacter.set(characterId, [...slices]);
    this.persist(characterId, slices);
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.pendingWrites]);
  }

  private persist(
    characterId: string,
    slices: ReadonlyArray<number>,
  ): void {
    const store = this.store;
    if (!store) return;
    const write = store
      .saveSlices(characterId, slices)
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(
          `failed to persist wheel slices for ${characterId}: ${reason}`,
        );
      });
    this.pendingWrites.add(write);
    void write.finally(() => this.pendingWrites.delete(write));
  }
}
