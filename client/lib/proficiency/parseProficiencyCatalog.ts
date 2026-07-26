import { PROFICIENCY_RULES } from "@tibia/protocol";
import type {
  ProficiencyLevel,
  ProficiencyPerk,
  ProficiencyProfile,
} from "./ProficiencyProfile";

const MAX_PROFILES = 2_000;
const OPTIONAL_INT_FIELDS = [
  "spellId",
  "augmentType",
  "range",
  "bestiaryId",
] as const;
const OPTIONAL_STRING_FIELDS = ["skill", "element", "bestiaryName"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPerk(value: unknown): value is ProficiencyPerk {
  if (!isRecord(value)) return false;
  if (
    typeof value.type !== "string" ||
    value.type.length < 1 ||
    value.type.length > 64 ||
    !/^[a-z0-9-]+$/.test(value.type) ||
    !Number.isFinite(value.value)
  ) {
    return false;
  }
  if (
    OPTIONAL_INT_FIELDS.some(
      (field) => value[field] !== undefined && !Number.isInteger(value[field]),
    )
  ) {
    return false;
  }
  return OPTIONAL_STRING_FIELDS.every(
    (field) =>
      value[field] === undefined ||
      (typeof value[field] === "string" &&
        String(value[field]).length >= 1 &&
        String(value[field]).length <= 64),
  );
}

function isLevel(value: unknown): value is ProficiencyLevel {
  return (
    isRecord(value) &&
    Array.isArray(value.perks) &&
    value.perks.length <= PROFICIENCY_RULES.maxPerksPerLevel &&
    value.perks.every(isPerk)
  );
}

function isProfile(value: unknown): value is ProficiencyProfile {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value.proficiencyId) &&
    Number(value.proficiencyId) >= 1 &&
    Number(value.proficiencyId) <= 10_000 &&
    typeof value.name === "string" &&
    value.name.length >= 1 &&
    value.name.length <= 100 &&
    Number.isInteger(value.version) &&
    Number(value.version) >= 1 &&
    Array.isArray(value.levels) &&
    value.levels.length <= PROFICIENCY_RULES.maxLevels &&
    value.levels.every(isLevel)
  );
}

/** Hard-validates the fetched proficiencies.json asset; throws on mismatch. */
export function parseProficiencyCatalog(
  value: unknown,
): ReadonlyArray<ProficiencyProfile> {
  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    !Array.isArray(value.profiles) ||
    value.profiles.length > MAX_PROFILES ||
    !value.profiles.every(isProfile)
  ) {
    throw new Error("invalid proficiency catalog");
  }
  return value.profiles;
}
