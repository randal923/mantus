import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { positionKey } from "../positionKey";
import type {
  ChestDefinition,
  ChestReward,
  ChestStorageWrite,
} from "./ChestDefinition";

const CHESTS_PATH = fileURLToPath(
  new URL("../../data/chests.json", import.meta.url),
);
const QUEST_CHESTS_PATH = fileURLToPath(
  new URL("../../data/quest-chests.json", import.meta.url),
);

function requireRewards(value: unknown, label: string): ChestReward[] {
  if (!Array.isArray(value)) throw new Error(`chests.json ${label} is invalid`);
  return value.map((entry) => {
    const { typeId, count, actionId, text } = entry as Record<string, unknown>;
    if (
      !Number.isInteger(typeId) ||
      Number(typeId) <= 0 ||
      !Number.isInteger(count) ||
      Number(count) <= 0
    ) {
      throw new Error(`chests.json ${label} has an invalid reward`);
    }
    if (
      actionId !== undefined &&
      (!Number.isInteger(actionId) ||
        Number(actionId) <= 0 ||
        Number(actionId) > 65_535)
    ) {
      throw new Error(`chests.json ${label} has an invalid reward action id`);
    }
    // The items table caps attributes jsonb at 4096 bytes; 3500 leaves room
    // for the JSON envelope and a key ActionId beside the text.
    if (
      text !== undefined &&
      (typeof text !== "string" || text.length === 0 || text.length > 3_500)
    ) {
      throw new Error(`chests.json ${label} has an invalid reward text`);
    }
    return {
      typeId: Number(typeId),
      count: Number(count),
      ...(actionId === undefined ? {} : { actionId: Number(actionId) }),
      ...(text === undefined ? {} : { text }),
    };
  });
}

function requireStorageWrites(
  value: unknown,
  uniqueId: unknown,
): ChestStorageWrite[] {
  if (!Array.isArray(value)) {
    throw new Error(`chests.json chest ${String(uniqueId)} storageWrites invalid`);
  }
  return value.map((entry) => {
    const { key, value: storageValue } = entry as Record<string, unknown>;
    if (
      typeof key !== "string" ||
      key.length === 0 ||
      key.length > 192 ||
      !Number.isInteger(storageValue)
    ) {
      throw new Error(
        `chests.json chest ${String(uniqueId)} has an invalid storage write`,
      );
    }
    return { key, value: Number(storageValue) };
  });
}

/**
 * Placed quest chests keyed by tile position: Canary's ChestUnique startup
 * table (chests.json) plus the quest_system1/2 chests generated from the
 * map's own actionId 2000/2001 items (quest-chests.json). Canary stamps the
 * ChestUnique ids onto the map at startup, so they are not in the OTBM. Maps
 * other than the one the data was authored for get an empty table, which
 * keeps every chest fail-closed there.
 */
export function loadChestDefinitions(
  mapName: string,
): ReadonlyMap<string, ChestDefinition> {
  const chests = new Map<string, ChestDefinition>();
  readChestFile(CHESTS_PATH, "chests.json", mapName, chests);
  readChestFile(QUEST_CHESTS_PATH, "quest-chests.json", mapName, chests);
  return chests;
}

function readChestFile(
  path: string,
  label: string,
  mapName: string,
  chests: Map<string, ChestDefinition>,
): void {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { formatVersion?: unknown }).formatVersion !== 1
  ) {
    throw new Error(`${label} has an unsupported format version`);
  }
  const document = parsed as { mapName?: unknown; chests?: unknown };
  if (document.mapName !== mapName) return;
  if (!Array.isArray(document.chests)) {
    throw new Error(`${label} has no chest list`);
  }
  for (const entry of document.chests) {
    const {
      uniqueId,
      itemTypeId,
      lootedKey,
      positions,
      reward,
      randomReward,
      containerTypeId,
      cooldownHours,
      storageWrites,
    } = entry as Record<string, unknown>;
    if (
      !Number.isInteger(uniqueId) ||
      !Number.isInteger(itemTypeId) ||
      typeof lootedKey !== "string" ||
      lootedKey.length === 0 ||
      lootedKey.length > 128 ||
      !Array.isArray(positions) ||
      positions.length === 0
    ) {
      throw new Error(`${label} has an invalid chest entry`);
    }
    const definition: ChestDefinition = {
      uniqueId: Number(uniqueId),
      itemTypeId: Number(itemTypeId),
      lootedKey,
      reward: requireRewards(reward, `chest ${String(uniqueId)}`),
      ...(randomReward === undefined
        ? {}
        : {
            randomReward: requireRewards(
              randomReward,
              `chest ${String(uniqueId)} randomReward`,
            ),
          }),
      ...(containerTypeId === undefined
        ? {}
        : { containerTypeId: Number(containerTypeId) }),
      ...(cooldownHours === undefined
        ? {}
        : { cooldownHours: Number(cooldownHours) }),
      ...(storageWrites === undefined
        ? {}
        : { storageWrites: requireStorageWrites(storageWrites, uniqueId) }),
    };
    if (
      definition.reward.length === 0 &&
      (definition.randomReward?.length ?? 0) === 0
    ) {
      throw new Error(`chests.json chest ${definition.uniqueId} has no reward`);
    }
    for (const position of positions) {
      const { x, y, z } = position as Record<string, unknown>;
      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        !Number.isInteger(z)
      ) {
        throw new Error(`${label} has an invalid chest position`);
      }
      const key = positionKey({ x: Number(x), y: Number(y), z: Number(z) });
      const existing = chests.get(key);
      if (existing && existing.uniqueId !== definition.uniqueId) {
        throw new Error(
          `chests ${existing.uniqueId} and ${definition.uniqueId} both claim position ${key}`,
        );
      }
      chests.set(key, definition);
    }
  }
}
