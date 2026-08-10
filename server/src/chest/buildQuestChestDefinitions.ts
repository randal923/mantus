import type { Position } from "@tibia/protocol";
import type { ChestReward } from "../action/ChestDefinition";
import type { ItemCatalog } from "../item/ItemCatalog";
import type {
  WorldItemSource,
  WorldItemSourceContent,
} from "../item/WorldItemSource";
import { positionKey } from "../positionKey";

/**
 * quest_system1.lua's specialQuests table (actionId -> storage), resolved
 * numerically against data-otservbr-global/lib/core/storages.lua so the
 * server-side builder does not parse Lua:
 *   51400 -> Storage.Quest.U8_2.TheThievesGuildQuest.Reward      = 41720
 *   51715 -> Storage.Quest.U8_0.BarbarianArena.RewardGreenhorn   = 41156
 *   51716 -> Storage.Quest.U8_0.BarbarianArena.RewardScrapper    = 41160
 *   51717 -> Storage.Quest.U8_0.BarbarianArena.RewardWarlord     = 41164
 */
const SPECIAL_QUEST_STORAGES: ReadonlyMap<number, number> = new Map<
  number,
  number
>([
  [51400, 41720],
  [51715, 41156],
  [51716, 41160],
  [51717, 41164],
]);

const QUEST_SYSTEM1_ACTION_ID = 2000;
const QUEST_SYSTEM2_ACTION_ID = 2001;
const BAG_TYPE_ID = 2853;
const BACKPACK_TYPE_ID = 2854;
const MAX_STORAGE_UID = 65_535;
const REWARD_ATTRIBUTE_KEYS = new Set(["count", "actionId", "text", "charges"]);

/**
 * Canary side effects of quest_system1's questsExperience/questLog/tutorialIds/
 * hotaQuest tables and its Barbarian Arena pit-door reset, keyed by the chest
 * storage uid. These chests still import normally; the side effect is recorded
 * in the output's `notes` array because we do not reproduce it yet.
 */
const CANARY_SIDE_EFFECTS: ReadonlyMap<number, string> = new Map<
  number,
  string
>([
  [3101, "Canary also grants 1 experience (questsExperience table)"],
  [
    8213,
    "Canary also sets Storage.Quest.U8_4.TheHiddenCityOfBeregar.DefaultStart (42003) = 1 (questLog table)",
  ],
  ...[23644, 24632, 14338].map(
    (uid): [number, string] => [
      uid,
      "Canary also resets Storage.Quest.U8_0.BarbarianArena.PitDoor (41152) to -1",
    ],
  ),
  [
    50080,
    "Canary also sends tutorial 5 and sets Storage.Quest.U8_2.TheBeginningQuest.SantiagoNpcGreetStorage = 3 (tutorialIds table)",
  ],
  [50082, "Canary also sends tutorial 6 (tutorialIds table)"],
  [50084, "Canary also sends tutorial 10 (tutorialIds table)"],
  [50086, "Canary also sends tutorial 11 (tutorialIds table)"],
  ...[50950, 50951, 50952, 50953, 50954, 50955].map(
    (uid): [number, string] => [
      uid,
      "Canary also sets Storage.Quest.U7_4.TheAncientTombs.DefaultStart (40401) = 1 (hotaQuest table)",
    ],
  ),
]);

/** One parsed quest_system2 config entry from canary-quest-system2.json. */
export interface QuestSystem2Entry {
  readonly uniqueId: number;
  readonly storage: number;
  readonly items: ReadonlyArray<{
    readonly itemId: number;
    readonly count: number;
    readonly actionId?: number;
    readonly text?: string;
  }>;
  readonly containerTypeId?: number;
  readonly status: "importable" | "deferred";
  readonly reason?: string;
}

/** A chest definition plus its map placement, as stored in quest-chests.json. */
export interface PlacedQuestChest {
  readonly uniqueId: number;
  readonly itemTypeId: number;
  readonly positions: ReadonlyArray<Position>;
  readonly lootedKey: string;
  readonly reward: ReadonlyArray<ChestReward>;
  readonly containerTypeId?: number;
}

export interface SkippedQuestChest {
  readonly uniqueId?: number;
  readonly position?: Position;
  readonly status: "excluded" | "deferred";
  readonly reason: string;
}

export interface QuestChestNote {
  readonly uniqueId: number;
  readonly positions: ReadonlyArray<Position>;
  readonly effect: string;
}

export interface QuestChestBuildResult {
  readonly chests: ReadonlyArray<PlacedQuestChest>;
  readonly skipped: ReadonlyArray<SkippedQuestChest>;
  readonly notes: ReadonlyArray<QuestChestNote>;
}

interface MutableCandidate {
  uniqueId: number;
  itemTypeId: number;
  positions: Position[];
  lootedKey: string;
  reward: ReadonlyArray<ChestReward>;
  containerTypeId?: number;
}

function integerAttribute(
  attributes: Readonly<Record<string, unknown>>,
  key: string,
): number | undefined {
  const value = attributes[key];
  if (!Number.isInteger(value) || Number(value) < 1) return undefined;
  return Number(value);
}

function contentReward(
  content: WorldItemSourceContent,
  catalog: ItemCatalog,
): { reward: ChestReward } | { status: "excluded" | "deferred"; reason: string } {
  if (content.contents.length > 0) {
    return { status: "deferred", reason: "nested container reward" };
  }
  const extraKeys = Object.keys(content.attributes)
    .filter((key) => !REWARD_ATTRIBUTE_KEYS.has(key))
    .sort();
  if (extraKeys.length > 0) {
    return {
      status: "deferred",
      reason: `unsupported content attributes: ${extraKeys.join(", ")}`,
    };
  }
  const type = catalog.get(content.typeId);
  if (!type || !type.pickupable) {
    return {
      status: "excluded",
      reason: `reward item ${content.typeId} is not takeable`,
    };
  }
  const rawCount = content.attributes.count;
  if (rawCount !== undefined && integerAttribute(content.attributes, "count") === undefined) {
    return { status: "deferred", reason: "invalid count attribute" };
  }
  const rawActionId = content.attributes.actionId;
  if (rawActionId !== undefined && integerAttribute(content.attributes, "actionId") === undefined) {
    return { status: "deferred", reason: "invalid actionId attribute" };
  }
  const text = content.attributes.text;
  if (text !== undefined && typeof text !== "string") {
    return { status: "deferred", reason: "invalid text attribute" };
  }
  const rawCharges = content.attributes.charges;
  if (rawCharges !== undefined && integerAttribute(content.attributes, "charges") === undefined) {
    return { status: "deferred", reason: "invalid charges attribute" };
  }
  return {
    reward: {
      typeId: content.typeId,
      count: integerAttribute(content.attributes, "count") ?? 1,
      ...(rawActionId !== undefined
        ? { actionId: Number(rawActionId) }
        : {}),
      ...(text !== undefined ? { text } : {}),
      ...(rawCharges !== undefined ? { charges: Number(rawCharges) } : {}),
    },
  };
}

function sameDefinition(left: MutableCandidate, right: MutableCandidate): boolean {
  return (
    left.itemTypeId === right.itemTypeId &&
    left.lootedKey === right.lootedKey &&
    left.containerTypeId === right.containerTypeId &&
    JSON.stringify(left.reward) === JSON.stringify(right.reward)
  );
}

function comparePositions(left: Position, right: Position): number {
  return left.x - right.x || left.y - right.y || left.z - right.z;
}

/**
 * Builds ChestService definitions for map chests scripted by Canary's
 * quest_system1 (aid 2000 + specialQuests aids: the map item's contents are
 * the reward, its uid is the storage) and quest_system2 (aid 2001: rewards
 * come from the parsed config table).
 *
 * `existingChests` are the already-imported ChestUnique definitions
 * (server/data/chests.json). Canary registers those per-item uniqueId actions
 * at startup and its action dispatch resolves uniqueId before actionId, so a
 * quest-system chest at a position covered by an existing chest never fires
 * in Canary either — such items are skipped as shadowed rather than treated
 * as conflicts. A genuine position collision among the generated chests
 * themselves is a hard error.
 */
export function buildQuestChestDefinitions(
  worldItems: ReadonlyArray<WorldItemSource>,
  catalog: ItemCatalog,
  questSystem2Entries: ReadonlyArray<QuestSystem2Entry>,
  existingChests: ReadonlyArray<{ positions: ReadonlyArray<Position> }>,
): QuestChestBuildResult {
  const entriesByUid = new Map(
    questSystem2Entries.map((entry) => [entry.uniqueId, entry]),
  );
  const shadowedPositions = new Set(
    existingChests.flatMap((chest) => chest.positions.map(positionKey)),
  );
  const skipped: SkippedQuestChest[] = [];
  const candidates: MutableCandidate[] = [];
  const matchedEntryUids = new Set<number>();

  for (const item of worldItems) {
    const actionId = integerAttribute(item.attributes, "actionId");
    if (actionId === undefined) continue;
    const isSpecial = SPECIAL_QUEST_STORAGES.has(actionId);
    if (
      actionId !== QUEST_SYSTEM1_ACTION_ID &&
      actionId !== QUEST_SYSTEM2_ACTION_ID &&
      !isSpecial
    ) {
      continue;
    }
    const uid = integerAttribute(item.attributes, "uniqueId");
    const position = item.position;
    if (shadowedPositions.has(positionKey(position))) {
      if (uid !== undefined) matchedEntryUids.add(uid);
      skipped.push({
        ...(uid !== undefined ? { uniqueId: uid } : {}),
        position,
        status: "excluded",
        reason:
          "shadowed by an existing chest definition at this position (Canary dispatches uniqueId actions before actionId)",
      });
      continue;
    }

    if (actionId === QUEST_SYSTEM2_ACTION_ID) {
      const entry = uid === undefined ? undefined : entriesByUid.get(uid);
      if (entry !== undefined) matchedEntryUids.add(entry.uniqueId);
      if (entry === undefined || entry.status !== "importable") {
        skipped.push({
          ...(uid !== undefined ? { uniqueId: uid } : {}),
          position,
          status: "deferred",
          reason: entry?.reason ?? "no quest_system2 config entry",
        });
        continue;
      }
      candidates.push({
        uniqueId: entry.uniqueId,
        itemTypeId: item.typeId,
        positions: [position],
        lootedKey: `chest-storage:${entry.storage}`,
        reward: entry.items.map((rewardItem) => ({
          typeId: rewardItem.itemId,
          count: rewardItem.count,
          ...(rewardItem.actionId !== undefined
            ? { actionId: rewardItem.actionId }
            : {}),
          ...(rewardItem.text !== undefined ? { text: rewardItem.text } : {}),
        })),
        ...(entry.containerTypeId !== undefined
          ? { containerTypeId: entry.containerTypeId }
          : {}),
      });
      continue;
    }

    const storage = isSpecial ? SPECIAL_QUEST_STORAGES.get(actionId) : uid;
    if (storage === undefined || storage > MAX_STORAGE_UID) {
      skipped.push({
        ...(uid !== undefined ? { uniqueId: uid } : {}),
        position,
        status: "excluded",
        reason: "no storage uid; Canary grants nothing either",
      });
      continue;
    }
    const hostType = catalog.get(item.typeId);
    if (hostType === undefined) {
      skipped.push({
        uniqueId: storage,
        position,
        status: "excluded",
        reason: `host item type ${item.typeId} is missing from the catalog`,
      });
      continue;
    }
    const isContainer = (hostType.containerCapacity ?? 0) > 0;
    let reward: ChestReward[];
    let containerTypeId: number | undefined;
    if (isContainer && item.contents.length > 0) {
      reward = [];
      let skip: SkippedQuestChest | undefined;
      for (const content of item.contents) {
        const result = contentReward(content, catalog);
        if ("reward" in result) {
          reward.push(result.reward);
          continue;
        }
        skip = {
          uniqueId: storage,
          position,
          status: result.status,
          reason: result.reason,
        };
        break;
      }
      if (skip !== undefined) {
        skipped.push(skip);
        continue;
      }
      const size = item.contents.length;
      containerTypeId =
        size === 1
          ? undefined
          : size <= 8
            ? BAG_TYPE_ID
            : size <= 20
              ? BACKPACK_TYPE_ID
              : item.typeId;
    } else if (item.contents.length > 0) {
      skipped.push({
        uniqueId: storage,
        position,
        status: "deferred",
        reason: "host has contents but is not a container in the catalog",
      });
      continue;
    } else {
      if (!hostType.pickupable) {
        skipped.push({
          uniqueId: storage,
          position,
          status: "excluded",
          reason: "reward item is not takeable",
        });
        continue;
      }
      reward = [
        {
          typeId: item.typeId,
          count: integerAttribute(item.attributes, "count") ?? 1,
        },
      ];
    }
    candidates.push({
      uniqueId: storage,
      itemTypeId: item.typeId,
      positions: [position],
      lootedKey: `chest-storage:${storage}`,
      reward,
      ...(containerTypeId !== undefined ? { containerTypeId } : {}),
    });
  }

  for (const entry of questSystem2Entries) {
    if (entry.status !== "deferred" || matchedEntryUids.has(entry.uniqueId)) {
      continue;
    }
    skipped.push({
      uniqueId: entry.uniqueId,
      status: "deferred",
      reason: entry.reason ?? "deferred quest_system2 entry",
    });
  }

  const byUid = new Map<number, MutableCandidate>();
  for (const candidate of candidates) {
    const existing = byUid.get(candidate.uniqueId);
    if (existing === undefined) {
      byUid.set(candidate.uniqueId, candidate);
      continue;
    }
    if (!sameDefinition(existing, candidate)) {
      throw new Error(
        `quest chests with uniqueId ${candidate.uniqueId} have conflicting definitions`,
      );
    }
    for (const position of candidate.positions) {
      if (!existing.positions.some((p) => comparePositions(p, position) === 0)) {
        existing.positions.push(position);
      }
    }
  }

  const chests = [...byUid.values()]
    .map((chest) => ({
      ...chest,
      positions: [...chest.positions].sort(comparePositions),
    }))
    .sort(
      (left, right) =>
        left.uniqueId - right.uniqueId ||
        comparePositions(left.positions[0]!, right.positions[0]!),
    );

  const positionOwners = new Map<string, number>();
  for (const chest of chests) {
    for (const position of chest.positions) {
      const key = positionKey(position);
      const owner = positionOwners.get(key);
      if (owner !== undefined) {
        throw new Error(
          `quest chests ${owner} and ${chest.uniqueId} collide at ${key}`,
        );
      }
      positionOwners.set(key, chest.uniqueId);
    }
  }

  const notes = chests.flatMap((chest) => {
    const effect = CANARY_SIDE_EFFECTS.get(chest.uniqueId);
    if (effect === undefined) return [];
    return [{ uniqueId: chest.uniqueId, positions: chest.positions, effect }];
  });

  const sortedSkipped = [...skipped].sort(
    (left, right) =>
      (left.uniqueId ?? Number.MAX_SAFE_INTEGER) -
        (right.uniqueId ?? Number.MAX_SAFE_INTEGER) ||
      comparePositions(
        left.position ?? { x: 0, y: 0, z: 0 },
        right.position ?? { x: 0, y: 0, z: 0 },
      ) ||
      left.reason.localeCompare(right.reason),
  );

  return { chests, skipped: sortedSkipped, notes };
}
