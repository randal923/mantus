import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  QuestDefinition,
  QuestMissionDefinition,
  QuestMissionState,
} from "./QuestDefinition";

const CONTENT_DIR =
  process.env.CONTENT_DIR ?? join(__dirname, "../../../content");
const STORAGE_KEY = /^[A-Za-z0-9_:.-]+$/;
const MIN_VALUE = -2_147_483_648;
const MAX_VALUE = 2_147_483_647;

function integer(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_VALUE ||
    value > MAX_VALUE
  ) {
    throw new Error(`${label} must be a bounded integer`);
  }
  return value;
}

function text(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maxLength) {
    throw new Error(`${label} must be a 1..${maxLength} character string`);
  }
  return value;
}

function storageKey(value: unknown, label: string): string {
  const key = text(value, label, 192);
  if (!STORAGE_KEY.test(key)) throw new Error(`${label} is malformed`);
  return key;
}

/**
 * Pinned quest-log catalog (Feature 103/105), generated from Canary's
 * data-otservbr-global/lib/core/quests/catalog by the parity tool. Applies
 * the same integrity rules as Canary's catalog.lua: mission ids unique per
 * quest, start storages unique across quests. Fails closed on any malformed
 * entry; an absent file is an empty catalog until Feature 105 lands it.
 */
export function loadQuestCatalog(
  contentDir = join(CONTENT_DIR, "quests"),
): ReadonlyArray<QuestDefinition> {
  let raw: string;
  try {
    raw = readFileSync(join(contentDir, "canary-quests.json"), "utf8");
  } catch {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("quest catalog must be an object");
  }
  const record = parsed as Record<string, unknown>;
  if (record.formatVersion !== 1) {
    throw new Error("quest catalog has an unsupported formatVersion");
  }
  if (!Array.isArray(record.quests)) {
    throw new Error("quest catalog is missing its quests list");
  }
  const quests: QuestDefinition[] = [];
  const seenQuestIds = new Set<number>();
  const seenStartKeys = new Map<string, string>();
  for (const entry of record.quests as unknown[]) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("quest catalog entry is malformed");
    }
    const quest = entry as Record<string, unknown>;
    const questId = integer(quest.questId, "questId");
    const name = text(quest.name, `quest ${questId} name`, 100);
    if (seenQuestIds.has(questId)) {
      throw new Error(`duplicate quest id ${questId}`);
    }
    seenQuestIds.add(questId);
    const startStorageKey = storageKey(
      quest.startStorageKey,
      `quest ${questId} startStorageKey`,
    );
    const startStorageValue = integer(
      quest.startStorageValue,
      `quest ${questId} startStorageValue`,
    );
    // Canary catalog.lua validateStartStorage: keyed by the storage alone.
    const previous = seenStartKeys.get(startStorageKey);
    if (previous !== undefined) {
      throw new Error(
        `quests "${previous}" and "${name}" share start storage ${startStorageKey}`,
      );
    }
    seenStartKeys.set(startStorageKey, name);
    const hasEndKey = quest.endStorageKey !== undefined;
    const hasEndValue = quest.endStorageValue !== undefined;
    if (hasEndKey !== hasEndValue) {
      throw new Error(`quest ${questId} end storage must set key and value`);
    }
    if (!Array.isArray(quest.missions) || quest.missions.length === 0) {
      throw new Error(`quest ${questId} has no missions`);
    }
    const missions: QuestMissionDefinition[] = [];
    const seenMissionIds = new Set<number>();
    for (const missionEntry of quest.missions as unknown[]) {
      if (typeof missionEntry !== "object" || missionEntry === null) {
        throw new Error(`quest ${questId} mission is malformed`);
      }
      const mission = missionEntry as Record<string, unknown>;
      const missionId = integer(mission.missionId, `quest ${questId} missionId`);
      // Canary catalog.lua: "Duplicate mission id %d found in quest".
      if (seenMissionIds.has(missionId)) {
        throw new Error(`duplicate mission id ${missionId} in quest ${questId}`);
      }
      seenMissionIds.add(missionId);
      const states: QuestMissionState[] = [];
      if (mission.states !== undefined) {
        if (!Array.isArray(mission.states)) {
          throw new Error(`quest ${questId} mission states are malformed`);
        }
        for (const stateEntry of mission.states as unknown[]) {
          const state = stateEntry as Record<string, unknown>;
          // Upstream carries a handful of deliberately empty state lines.
          const description = state.description;
          if (typeof description !== "string" || description.length > 1_000) {
            throw new Error(`quest ${questId} state description is malformed`);
          }
          states.push({
            value: integer(state.value, `quest ${questId} state value`),
            description,
          });
        }
      }
      const dynamic =
        mission.dynamicDescription === true || mission.dynamicStates !== undefined;
      if (
        mission.description === undefined &&
        states.length === 0 &&
        !dynamic
      ) {
        throw new Error(`quest ${questId} mission ${missionId} lacks text`);
      }
      missions.push({
        missionId,
        name: text(mission.name, `quest ${questId} mission name`, 100),
        storageKey: storageKey(
          mission.storageKey,
          `quest ${questId} mission storageKey`,
        ),
        startValue: integer(mission.startValue, `quest ${questId} startValue`),
        endValue: integer(mission.endValue, `quest ${questId} endValue`),
        ...(mission.ignoreEndValue === true ? { ignoreEndValue: true } : {}),
        ...(mission.hideWhenNextStarted === true
          ? { hideWhenNextStarted: true }
          : {}),
        ...(mission.description === undefined
          ? {}
          : {
              description: text(
                mission.description,
                `quest ${questId} mission description`,
                1_000,
              ),
            }),
        ...(states.length === 0 ? {} : { states }),
      });
    }
    quests.push({
      questId,
      name,
      startStorageKey,
      startStorageValue,
      ...(hasEndKey
        ? {
            endStorageKey: storageKey(
              quest.endStorageKey,
              `quest ${questId} endStorageKey`,
            ),
            endStorageValue: integer(
              quest.endStorageValue,
              `quest ${questId} endStorageValue`,
            ),
          }
        : {}),
      missions,
    });
  }
  return quests;
}
