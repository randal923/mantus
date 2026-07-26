import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PROFILE_LIMITS } from "@tibia/protocol";
import type { AchievementDefinition } from "./achievementCatalog";

const CATALOG_PATH = fileURLToPath(
  new URL("../../../content/profile/canary-achievements.json", import.meta.url),
);
const EXPECTED_COMMIT = "a879c9312e34381e8eedf397b8ed44510698b689";
const EXPECTED_SHA256 =
  "de33d7341d17e3410da5346c229ce68317526d70785b0a2e277f3fff546f1f7d";
const EXPECTED_COUNT = 541;

/**
 * Loads the imported Canary achievement catalog
 * (tools/importCanaryAchievements.mjs). The slugs are durable grant keys, so
 * the catalog is pinned by commit + sha256 and every field is re-validated
 * before it reaches the ACHIEVEMENTS map.
 */
export function loadCanaryAchievements(): ReadonlyArray<AchievementDefinition> {
  const value: unknown = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    !isRecord(value.source) ||
    value.source.canaryCommit !== EXPECTED_COMMIT ||
    value.source.sha256 !== EXPECTED_SHA256 ||
    !Array.isArray(value.achievements) ||
    value.achievements.length !== EXPECTED_COUNT
  ) {
    throw new Error("Canary achievement catalog has invalid provenance");
  }
  const seen = new Set<string>();
  return value.achievements.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.slug !== "string" ||
      entry.slug.length < 1 ||
      entry.slug.length > PROFILE_LIMITS.maxIdLength ||
      typeof entry.name !== "string" ||
      entry.name.length < 1 ||
      entry.name.length > PROFILE_LIMITS.maxNameLength ||
      typeof entry.description !== "string" ||
      entry.description.length < 1 ||
      entry.description.length > PROFILE_LIMITS.maxDescriptionLength ||
      (entry.grade !== 1 &&
        entry.grade !== 2 &&
        entry.grade !== 3 &&
        entry.grade !== 4) ||
      typeof entry.points !== "number" ||
      !Number.isInteger(entry.points) ||
      entry.points < 0 ||
      entry.points > 10 ||
      typeof entry.secret !== "boolean"
    ) {
      throw new Error(
        `Canary achievement ${String(
          isRecord(entry) ? entry.slug : entry,
        )} has invalid metadata`,
      );
    }
    if (seen.has(entry.slug)) {
      throw new Error(`Canary achievement slug repeats: ${entry.slug}`);
    }
    seen.add(entry.slug);
    return {
      achievementId: entry.slug,
      name: entry.name,
      description: entry.description,
      grade: entry.grade,
      points: entry.points,
      secret: entry.secret,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
