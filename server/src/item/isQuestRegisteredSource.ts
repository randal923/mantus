/** Action ids Canary's quest systems register (quest_system1/2, specialQuests). */
const QUEST_ACTION_IDS = new Set([2_000, 2_001, 51_400, 51_715, 51_716, 51_717]);
/** Unique-id ranges quest_reward_common.lua registers its chest action on. */
const QUEST_UNIQUE_ID_RANGES = [
  [5_000, 9_000],
  [10_000, 12_000],
  [14_092, 14_092],
] as const;

/**
 * True when a map item's OTBM attributes mark it as claimed by one of
 * Canary's quest actions. Such a container must never open as a plain world
 * container: its contents are the quest reward, and the registered action
 * (our chest table) is the only legitimate way to receive them (charter
 * rule 8 — the per-character looted gate is the real limit).
 */
export function isQuestRegisteredSource(
  attributes: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (!attributes) return false;
  const { actionId, uniqueId } = attributes;
  if (typeof actionId === "number" && QUEST_ACTION_IDS.has(actionId)) {
    return true;
  }
  return (
    typeof uniqueId === "number" &&
    QUEST_UNIQUE_ID_RANGES.some(([from, to]) => uniqueId >= from && uniqueId <= to)
  );
}
