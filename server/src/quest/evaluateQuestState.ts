import type {
  QuestDefinition,
  QuestMissionDefinition,
} from "./QuestDefinition";

/** Reads one canonical storage value; -1 means unset. */
export type QuestStorageRead = (key: string) => number;

// Pinned Canary data/libs/functions/quests.lua:1005-1156, value for value.

export function questIsStarted(
  quest: QuestDefinition,
  read: QuestStorageRead,
): boolean {
  const value = read(quest.startStorageKey);
  return value !== -1 && value >= quest.startStorageValue;
}

export function missionIsCompleted(
  mission: QuestMissionDefinition,
  read: QuestStorageRead,
): boolean {
  const value = read(mission.storageKey);
  return value !== -1 && value >= mission.endValue;
}

export function missionIsStarted(
  quest: QuestDefinition,
  mission: QuestMissionDefinition,
  read: QuestStorageRead,
): boolean {
  const value = read(mission.storageKey);
  if (
    value === -1 ||
    value < mission.startValue ||
    (!mission.ignoreEndValue && value > mission.endValue)
  ) {
    return false;
  }
  if (
    mission.hideWhenNextStarted &&
    missionIsCompleted(mission, read) &&
    hasLaterMissionStarted(quest, mission, read)
  ) {
    return false;
  }
  return true;
}

function hasLaterMissionStarted(
  quest: QuestDefinition,
  mission: QuestMissionDefinition,
  read: QuestStorageRead,
): boolean {
  const index = quest.missions.indexOf(mission);
  if (index < 0) return false;
  return quest.missions
    .slice(index + 1)
    .some((later) => missionIsStarted(quest, later, read));
}

export function questIsCompleted(
  quest: QuestDefinition,
  read: QuestStorageRead,
): boolean {
  if (quest.endStorageKey !== undefined && quest.endStorageValue !== undefined) {
    const value = read(quest.endStorageKey);
    return value !== -1 && value >= quest.endStorageValue;
  }
  return quest.missions.every((mission) => missionIsCompleted(mission, read));
}

export function missionDescription(
  mission: QuestMissionDefinition,
  read: QuestStorageRead,
): string {
  if (mission.description !== undefined) return mission.description;
  const states = mission.states ?? [];
  const value = read(mission.storageKey);
  const maxValue = states.reduce(
    (max, state) => Math.max(max, state.value),
    Number.MIN_SAFE_INTEGER,
  );
  const lookup =
    mission.ignoreEndValue && value > maxValue ? maxValue : value;
  return (
    states.find((state) => state.value === lookup)?.description ??
    // Canary's literal fallback when a state is missing for the value.
    "An error has occurred, please contact a gamemaster."
  );
}
