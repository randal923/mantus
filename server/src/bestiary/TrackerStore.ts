export interface TrackerSnapshot {
  readonly bestiary: ReadonlyArray<number>;
  readonly bosstiary: ReadonlyArray<number>;
}

/** Durable cyclopedia kill-tracker lists; mutations persist write-behind. */
export interface TrackerStore {
  load(characterId: string): Promise<TrackerSnapshot>;
  set(
    characterId: string,
    scope: "bestiary" | "bosstiary",
    raceId: number,
    enabled: boolean,
  ): Promise<void>;
}
