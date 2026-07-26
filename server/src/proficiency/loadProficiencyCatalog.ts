import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ProficiencyCatalog,
  ProficiencyProfile,
} from "./ProficiencyCatalog";

const CONTENT_DIR =
  process.env.CONTENT_DIR ??
  fileURLToPath(new URL("../../../content", import.meta.url));

/**
 * Loads the pinned weapon-proficiency perk tables
 * (content/proficiencies.json, transcribed from Canary by
 * tools/importCanaryProficiencies.mjs). Fails closed on shape surprises.
 */
export function loadProficiencyCatalog(): ProficiencyCatalog {
  const parsed: unknown = JSON.parse(
    readFileSync(join(CONTENT_DIR, "proficiencies.json"), "utf8"),
  );
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { formatVersion?: unknown }).formatVersion !== 1 ||
    !Array.isArray((parsed as { profiles?: unknown }).profiles)
  ) {
    throw new Error("proficiency catalog has an unsupported format");
  }
  const profiles = new Map<number, ProficiencyProfile>();
  for (const profile of (parsed as { profiles: ProficiencyProfile[] })
    .profiles) {
    if (
      !Number.isInteger(profile.proficiencyId) ||
      profile.proficiencyId <= 0 ||
      !Array.isArray(profile.levels)
    ) {
      throw new Error("proficiency catalog profile is invalid");
    }
    profiles.set(profile.proficiencyId, profile);
  }
  if (profiles.size === 0) throw new Error("proficiency catalog is empty");
  return { profiles };
}
