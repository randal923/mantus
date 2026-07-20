import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BESTIARY_LIMITS,
  bestiaryClassSchema,
  bossCategorySchema,
} from "@tibia/protocol";
import type { MonsterType } from "../creature/MonsterType";
import type {
  BestiaryCatalog,
  BestiaryCatalogEntry,
  BossCatalogEntry,
} from "./BestiaryCatalog";

const CONTENT_PATH = fileURLToPath(
  new URL("../../../content/monsters/bestiary.json", import.meta.url),
);

/**
 * Loads bestiary/bosstiary metadata and joins it against the live monster
 * catalog. Entries whose monsters are absent from this world are dropped
 * (the starter world only carries a handful of types).
 */
export function loadBestiaryCatalog(
  monsterTypes: ReadonlyMap<string, MonsterType>,
): BestiaryCatalog {
  const document = JSON.parse(readFileSync(CONTENT_PATH, "utf8")) as {
    formatVersion: number;
    bestiary: unknown[];
    bosstiary: unknown[];
  };
  if (document.formatVersion !== 1) {
    throw new Error("bestiary content has an unsupported version");
  }
  const entriesByRaceId = new Map<number, BestiaryCatalogEntry>();
  const bossesByRaceId = new Map<number, BossCatalogEntry>();
  const raceIdByMonsterTypeId = new Map<string, number>();

  for (const value of document.bestiary) {
    const entry = record(value);
    const monsterType = presentMonsterTypes(entry, monsterTypes);
    if (!monsterType) continue;
    const raceId = boundedInteger(entry.raceId, 1, BESTIARY_LIMITS.maxRaceId);
    const firstUnlock = boundedInteger(entry.firstUnlock, 1, BESTIARY_LIMITS.maxKills);
    const secondUnlock = boundedInteger(entry.secondUnlock, 1, BESTIARY_LIMITS.maxKills);
    const toKill = boundedInteger(entry.toKill, 1, BESTIARY_LIMITS.maxKills);
    if (!(firstUnlock < secondUnlock && secondUnlock < toKill)) {
      throw new Error(`bestiary race ${raceId} has non-increasing thresholds`);
    }
    if (entriesByRaceId.has(raceId) || bossesByRaceId.has(raceId)) {
      throw new Error(`bestiary race ${raceId} is duplicated`);
    }
    entriesByRaceId.set(raceId, {
      raceId,
      className: bestiaryClassSchema.parse(entry.class),
      stars: boundedInteger(entry.stars, 0, 5),
      occurrence: boundedInteger(entry.occurrence, 0, 4),
      charmPoints: boundedInteger(entry.charmPoints, 0, 10_000),
      firstUnlock,
      secondUnlock,
      toKill,
      locations:
        typeof entry.locations === "string"
          ? entry.locations.slice(0, BESTIARY_LIMITS.maxLocationsLength)
          : "",
      monsterType,
    });
    registerMonsterIds(entry, monsterTypes, raceId, raceIdByMonsterTypeId);
  }

  for (const value of document.bosstiary) {
    const entry = record(value);
    const monsterType = presentMonsterTypes(entry, monsterTypes);
    if (!monsterType) continue;
    const raceId = boundedInteger(entry.raceId, 1, BESTIARY_LIMITS.maxRaceId);
    if (entriesByRaceId.has(raceId) || bossesByRaceId.has(raceId)) {
      throw new Error(`bosstiary race ${raceId} is duplicated`);
    }
    bossesByRaceId.set(raceId, {
      raceId,
      category: bossCategorySchema.parse(entry.category),
      monsterType,
    });
    registerMonsterIds(entry, monsterTypes, raceId, raceIdByMonsterTypeId);
  }

  return { entriesByRaceId, bossesByRaceId, raceIdByMonsterTypeId };
}

function presentMonsterTypes(
  entry: Record<string, unknown>,
  monsterTypes: ReadonlyMap<string, MonsterType>,
): MonsterType | undefined {
  for (const monsterId of monsterIds(entry)) {
    const type = monsterTypes.get(monsterId);
    if (type) return type;
  }
  return undefined;
}

function registerMonsterIds(
  entry: Record<string, unknown>,
  monsterTypes: ReadonlyMap<string, MonsterType>,
  raceId: number,
  raceIdByMonsterTypeId: Map<string, number>,
): void {
  for (const monsterId of monsterIds(entry)) {
    if (!monsterTypes.has(monsterId)) continue;
    if (raceIdByMonsterTypeId.has(monsterId)) {
      throw new Error(`monster ${monsterId} belongs to two bestiary races`);
    }
    raceIdByMonsterTypeId.set(monsterId, raceId);
  }
}

function monsterIds(entry: Record<string, unknown>): string[] {
  const value = entry.monsterIds;
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) {
    throw new Error("bestiary entry has an invalid monster id list");
  }
  return value as string[];
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`bestiary value ${String(value)} is out of range`);
  }
  return Number(value);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("bestiary entry must be an object");
  }
  return value as Record<string, unknown>;
}
