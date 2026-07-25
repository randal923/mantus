import { HOUSE_LIMITS } from "@tibia/protocol";
import {
  EMPTY_HOUSE_ACCESS_LIST,
  type HouseAccessList,
} from "./HouseAccessList";

/** Canary escapes these before turning `*`/`?` into wildcards. */
const METACHARACTERS = new Set([
  ".",
  "[",
  "]",
  "{",
  "}",
  "(",
  ")",
  "\\",
  "+",
  "|",
  "^",
  "$",
]);

function toRegex(expression: string): RegExp | null {
  let pattern = "";
  for (const character of expression) {
    if (METACHARACTERS.has(character)) pattern += "\\";
    pattern += character;
  }
  // Only `*` and `?` survive unescaped, so the result has no nested
  // quantifiers and cannot backtrack catastrophically on bounded input.
  pattern = pattern.replaceAll("*", ".*").replaceAll("?", ".?");
  try {
    return new RegExp(`^${pattern}$`);
  } catch {
    return null;
  }
}

/**
 * Parses Canary's house access-list syntax into inert match data:
 *
 * - `#…` comments and blank lines are ignored, as are over-long lines.
 * - `*` on its own grants everyone.
 * - `@guild` grants a whole guild; `rank@guild` grants one rank of it.
 * - a name containing `*`, `?`, or a leading `!` becomes a wildcard pattern
 *   (`!` denies); the first matching pattern decides.
 * - anything else is an exact character name.
 *
 * Nothing here touches game state, and the caller has already bounded the
 * text through the zod schema, so a malformed list can only ever produce
 * fewer matches — never an error or an unbounded pattern (charter rule 1).
 */
export function parseHouseAccessList(body: string): HouseAccessList {
  if (!body.trim()) return EMPTY_HOUSE_ACCESS_LIST;
  let everyone = false;
  const names = new Set<string>();
  const guilds = new Set<string>();
  const guildRanks: Array<{ guild: string; rank: string }> = [];
  const patterns: Array<{ regex: RegExp; allow: boolean }> = [];
  const lines = body.split("\n").slice(0, HOUSE_LIMITS.maxAccessListLines);
  for (const raw of lines) {
    const line = raw.trim().toLowerCase();
    if (
      !line ||
      line.startsWith("#") ||
      line.length > HOUSE_LIMITS.maxAccessListLineLength
    ) {
      continue;
    }
    if (line === "*") {
      everyone = true;
      continue;
    }
    const at = line.indexOf("@");
    if (at === 0) {
      const guild = line.slice(1).trim();
      if (guild) guilds.add(guild);
      continue;
    }
    if (at > 0) {
      const rank = line.slice(0, at).trim();
      const guild = line.slice(at + 1).trim();
      if (rank && guild) guildRanks.push({ guild, rank });
      continue;
    }
    if (!/[!*?]/.test(line)) {
      names.add(line);
      continue;
    }
    const allow = !line.startsWith("!");
    const regex = toRegex(allow ? line : line.slice(1));
    if (regex) patterns.push({ regex, allow });
  }
  return { everyone, names, guilds, guildRanks, patterns };
}
