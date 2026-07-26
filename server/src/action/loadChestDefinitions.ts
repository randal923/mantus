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

function requireRewards(value: unknown, label: string): ChestReward[] {
  if (!Array.isArray(value)) throw new Error(`chests.json ${label} is invalid`);
  return value.map((entry) => {
    const { typeId, count } = entry as Record<string, unknown>;
    if (
      !Number.isInteger(typeId) ||
      Number(typeId) <= 0 ||
      !Number.isInteger(count) ||
      Number(count) <= 0
    ) {
      throw new Error(`chests.json ${label} has an invalid reward`);
    }
    return { typeId: Number(typeId), count: Number(count) };
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
 * Placed quest chests keyed by tile position, imported from Canary's otservbr
 * startup tables (Canary stamps these unique ids onto the map at startup, so
 * they are not in the OTBM). Maps other than the one the data was authored
 * for get an empty table, which keeps every chest fail-closed there.
 */
export function loadChestDefinitions(
  mapName: string,
): ReadonlyMap<string, ChestDefinition> {
  const parsed: unknown = JSON.parse(readFileSync(CHESTS_PATH, "utf8"));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { formatVersion?: unknown }).formatVersion !== 1
  ) {
    throw new Error("chests.json has an unsupported format version");
  }
  const document = parsed as { mapName?: unknown; chests?: unknown };
  if (document.mapName !== mapName) return new Map();
  if (!Array.isArray(document.chests)) {
    throw new Error("chests.json has no chest list");
  }
  const chests = new Map<string, ChestDefinition>();
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
      throw new Error("chests.json has an invalid chest entry");
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
        throw new Error("chests.json has an invalid chest position");
      }
      chests.set(
        positionKey({ x: Number(x), y: Number(y), z: Number(z) }),
        definition,
      );
    }
  }
  return chests;
}
