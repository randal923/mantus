import { AIM_AT_TARGET_SPELL_LIMIT } from "@tibia/protocol";

const SPELL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Parses the persisted "aim at target" spell set. Anything unrecognised
 * degrades to an empty set rather than throwing: the setting is a cosmetic
 * targeting preference, and the cast pipeline re-validates the spell itself.
 */
export function parseAimAtTargetSpells(raw: unknown): ReadonlyArray<string> {
  if (!Array.isArray(raw)) return [];
  const spellIds = new Set<string>();
  for (const entry of raw) {
    if (spellIds.size >= AIM_AT_TARGET_SPELL_LIMIT) break;
    if (
      typeof entry !== "string" ||
      entry.length < 1 ||
      entry.length > 64 ||
      !SPELL_ID.test(entry)
    ) {
      continue;
    }
    spellIds.add(entry);
  }
  return [...spellIds];
}
