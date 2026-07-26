/**
 * Typed quest-log definitions (Feature 103), mirroring pinned Canary's Lua
 * catalog (data/lib/core/quests/catalog.lua): a quest starts existing for a
 * character once its start storage reaches `startStorageValue`; each mission
 * is a value range on one storage key, with either a single description or
 * per-value states.
 */
export interface QuestMissionState {
  readonly value: number;
  readonly description: string;
}

export interface QuestMissionDefinition {
  /** Stable per-quest mission id (Canary validates uniqueness). */
  readonly missionId: number;
  readonly name: string;
  readonly storageKey: string;
  readonly startValue: number;
  readonly endValue: number;
  /** Canary `ignoreendvalue`: started stays true past endValue. */
  readonly ignoreEndValue?: boolean;
  /** Canary `hideWhenNextStarted`: hide once completed and a later mission runs. */
  readonly hideWhenNextStarted?: boolean;
  /** Fixed description, used when `states` is empty. */
  readonly description?: string;
  /** Description keyed by exact storage value (Canary mission.states[value]). */
  readonly states?: ReadonlyArray<QuestMissionState>;
}

export interface QuestDefinition {
  /** Stable quest id; never reused. */
  readonly questId: number;
  readonly name: string;
  readonly startStorageKey: string;
  readonly startStorageValue: number;
  /** Optional completion override (Canary endStorageId/endStorageValue). */
  readonly endStorageKey?: string;
  readonly endStorageValue?: number;
  readonly missions: ReadonlyArray<QuestMissionDefinition>;
}
