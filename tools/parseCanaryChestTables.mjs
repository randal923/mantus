const stripComments = (lua) =>
  lua.replace(/--\[\[[\s\S]*?\]\]/g, "").replace(/--[^\n]*/g, "");

/** Body of `name = { ... }` starting at the brace, balanced. */
function tableBody(lua, name) {
  const header = new RegExp(`(^|\\n)${name}\\s*=\\s*\\{`).exec(lua);
  if (!header) throw new Error(`table ${name} not found`);
  const start = lua.indexOf("{", header.index);
  let depth = 0;
  for (let index = start; index < lua.length; index++) {
    if (lua[index] === "{") depth++;
    else if (lua[index] === "}") {
      depth--;
      if (depth === 0) return lua.slice(start + 1, index);
    }
  }
  throw new Error(`table ${name} is unbalanced`);
}

/** Splits a table body into its top-level `key = value` chunks. */
function splitFields(body) {
  const fields = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index++) {
    const character = body[index];
    if (character === "{") depth++;
    else if (character === "}") depth--;
    else if (character === "," && depth === 0) {
      fields.push(body.slice(start, index));
      start = index + 1;
    }
  }
  fields.push(body.slice(start));
  return fields.map((field) => field.trim()).filter((field) => field !== "");
}

function splitAssignment(field) {
  const separator = field.indexOf("=");
  if (separator === -1) return null;
  const key = field.slice(0, separator).trim();
  return { key, value: field.slice(separator + 1).trim() };
}

/**
 * Flattens Canary's data-otservbr-global/lib/core/storages.lua into dotted
 * paths (`Storage.Quest.Key.ID0010`) mapped to their numeric constants. Only
 * integer leaves are kept — the trailing `startupGlobalStorages` array holds
 * references, not definitions.
 */
export function parseStorageConstants(lua) {
  const constants = new Map();
  const walk = (body, prefix) => {
    for (const field of splitFields(body)) {
      const assignment = splitAssignment(field);
      if (!assignment) continue;
      const { key, value } = assignment;
      if (!/^[A-Za-z_]\w*$/.test(key)) continue;
      const path = `${prefix}.${key}`;
      if (value.startsWith("{")) {
        walk(value.slice(1, value.lastIndexOf("}")), path);
        continue;
      }
      const numeric = /^-?\d+$/.exec(value);
      if (numeric) constants.set(path, Number(numeric[0]));
    }
  };
  const stripped = stripComments(lua);
  for (const root of ["Storage", "GlobalStorage"]) {
    walk(tableBody(stripped, root), root);
  }
  if (constants.size === 0) throw new Error("no storage constants parsed");
  return constants;
}

function parsePositions(value) {
  const positions = [];
  for (const match of value.matchAll(
    /x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)\s*,\s*z\s*=\s*(\d+)/g,
  )) {
    positions.push({
      x: Number(match[1]),
      y: Number(match[2]),
      z: Number(match[3]),
    });
  }
  return positions;
}

function parseRewards(value) {
  const rewards = [];
  for (const match of value.matchAll(/\{\s*(\d+)\s*,\s*(\d+)\s*\}/g)) {
    rewards.push({ typeId: Number(match[1]), count: Number(match[2]) });
  }
  return rewards;
}

function resolveStorage(value, storages) {
  const numeric = /^-?\d+$/.exec(value);
  if (numeric) return Number(numeric[0]);
  return storages.get(value) ?? null;
}

/**
 * Parses the `ChestUnique` table from Canary's
 * data-otservbr-global/startup/tables/chest.lua. Each entry is one placed
 * quest chest: the unique id Canary stamps onto the map item at startup, the
 * positions it is stamped at, the reward list, and the per-character storage
 * (or quest KV name) that records it as already looted.
 */
export function parseChestUnique(lua, storages) {
  const chests = [];
  const body = tableBody(stripComments(lua), "ChestUnique");
  for (const field of splitFields(body)) {
    const match = /^\[\s*(\d+)\s*\]\s*=\s*\{([\s\S]*)\}$/.exec(field);
    if (!match) continue;
    const uniqueId = Number(match[1]);
    const chest = {
      uniqueId,
      itemTypeId: null,
      positions: [],
      reward: [],
      randomReward: [],
      containerTypeId: null,
      isKey: false,
      weightOunces: null,
      keyActionId: null,
      storageKey: null,
      storageName: null,
      questName: null,
      timeHours: null,
      unparsedFields: [],
    };
    for (const entry of splitFields(match[2])) {
      const assignment = splitAssignment(entry);
      if (!assignment) continue;
      const { key, value } = assignment;
      switch (key) {
        case "itemId":
          chest.itemTypeId = /^\d+$/.test(value) ? Number(value) : null;
          break;
        case "itemPos":
          chest.positions = parsePositions(value);
          break;
        case "reward":
          chest.reward = parseRewards(value);
          break;
        case "randomReward":
          chest.randomReward = parseRewards(value);
          break;
        case "container":
          chest.containerTypeId = /^\d+$/.test(value) ? Number(value) : null;
          break;
        case "isKey":
          chest.isKey = value === "true";
          break;
        case "useKV":
          break;
        case "weight":
          chest.weightOunces = Number.parseFloat(value);
          break;
        case "keyAction":
          chest.keyActionId = resolveStorage(value, storages);
          break;
        case "action":
          break;
        case "storage":
          chest.storageName = value;
          chest.storageKey = resolveStorage(value, storages);
          break;
        case "questName":
          chest.questName = value.replace(/^["']|["']$/g, "");
          break;
        case "time":
          chest.timeHours = Number.parseFloat(value);
          break;
        default:
          chest.unparsedFields.push(key);
      }
    }
    if (chest.positions.length === 0) {
      throw new Error(`chest ${uniqueId} has no position`);
    }
    // Canary's quest_reward_common stamps the key's ActionId from the chest's
    // storage when isKey is set; keyAction only overrides it for keys granted
    // inside a container.
    if (
      chest.isKey &&
      chest.keyActionId === null &&
      Number.isInteger(chest.storageKey)
    ) {
      chest.keyActionId = chest.storageKey;
    }
    chests.push(chest);
  }
  if (chests.length === 0) throw new Error("no chests parsed");
  return chests;
}

/**
 * Unique-id ranges Canary's data-otservbr-global quest_reward_common.lua
 * registers. A chest outside them is stamped onto the map but answered by its
 * own quest script, so it belongs to the quest-storage workstream.
 */
const COMMON_REWARD_UID_RANGES = [
  [5_000, 9_000],
  [10_000, 12_000],
  [14_092, 14_092],
];

/**
 * Classifies one parsed chest for the import report. A chest is importable
 * when the common reward action answers it and it names a placed item type, a
 * reward, and a durable per-character looted key; everything else is recorded
 * with the reason it is skipped so nothing is silently dropped.
 */
export function classifyChest(chest) {
  if (
    !COMMON_REWARD_UID_RANGES.some(
      ([from, to]) => chest.uniqueId >= from && chest.uniqueId <= to,
    )
  ) {
    return {
      status: "deferred",
      reason:
        "outside quest_reward_common.lua's registered uid ranges; answered by its own quest script",
    };
  }
  if (chest.unparsedFields.length > 0) {
    return {
      status: "excluded",
      reason: `unrecognised fields: ${chest.unparsedFields.join(", ")}`,
    };
  }
  if (chest.itemTypeId === null) {
    return {
      status: "excluded",
      reason: "no chest item type is placed (map-only action stamp)",
    };
  }
  if (chest.reward.length === 0 && chest.randomReward.length === 0) {
    return { status: "excluded", reason: "no reward is configured" };
  }
  if (chest.storageKey === null && chest.questName === null) {
    return {
      status: "excluded",
      reason: `looted key ${
        chest.storageName ?? "(missing)"
      } does not resolve to a storage constant, so Canary grants nothing either`,
    };
  }
  return { status: "implemented", reason: "" };
}

/** Stable durable key for a chest's per-character looted row. */
export function chestLootedKey(chest) {
  if (chest.questName !== null) return `chest-kv:${chest.questName}`;
  return `chest-storage:${chest.storageKey}`;
}
