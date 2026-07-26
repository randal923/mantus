/** One reward stack a chest grants. */
export interface ChestReward {
  readonly typeId: number;
  readonly count: number;
}

/**
 * One placed quest chest, imported from Canary's ChestUnique startup table.
 * `lootedKey` is the durable per-character key that records this chest as
 * already looted; `cooldownHours` makes it repeatable after that long.
 */
export interface ChestStorageWrite {
  readonly key: string;
  readonly value: number;
}

export interface ChestDefinition {
  readonly uniqueId: number;
  readonly itemTypeId: number;
  readonly lootedKey: string;
  readonly reward: ReadonlyArray<ChestReward>;
  /** One entry is picked server-side when present, replacing `reward`. */
  readonly randomReward?: ReadonlyArray<ChestReward>;
  /** Rewards land inside a freshly granted container of this type. */
  readonly containerTypeId?: number;
  readonly cooldownHours?: number;
  /**
   * Quest flags this chest sets when looted (Feature 104): applied through
   * the quest platform in the same resolved outcome as the grant, and
   * audited as `quest-reward` in the grant transaction.
   */
  readonly storageWrites?: ReadonlyArray<ChestStorageWrite>;
}
