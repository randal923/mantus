import type { TrackerSnapshot, TrackerStore } from "./TrackerStore";

export class MemoryTrackerStore implements TrackerStore {
  private readonly rows = new Map<string, Set<string>>();

  async load(characterId: string): Promise<TrackerSnapshot> {
    const keys = this.rows.get(characterId) ?? new Set();
    const bestiary: number[] = [];
    const bosstiary: number[] = [];
    for (const key of keys) {
      const [scope, raceId] = key.split(":");
      (scope === "bosstiary" ? bosstiary : bestiary).push(Number(raceId));
    }
    return { bestiary, bosstiary };
  }

  async set(
    characterId: string,
    scope: "bestiary" | "bosstiary",
    raceId: number,
    enabled: boolean,
  ): Promise<void> {
    const keys = this.rows.get(characterId) ?? new Set<string>();
    this.rows.set(characterId, keys);
    const key = `${scope}:${raceId}`;
    if (enabled) keys.add(key);
    else keys.delete(key);
  }
}
