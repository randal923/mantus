import type { HouseAccessList, HouseAccessSubject } from "./HouseAccessList";

/**
 * Evaluates a parsed access list against a subject's *current* identity.
 * Guild entries resolve against the live membership handed in by the caller,
 * never against a snapshot taken when the list was written, so a character
 * who left the guild fails the very next check (charter rule 4).
 *
 * Order mirrors Canary: everyone, exact name, guild/rank, then wildcard
 * patterns where the first match — allow or deny — decides.
 */
export function matchesHouseAccessList(
  list: HouseAccessList,
  subject: HouseAccessSubject,
): boolean {
  const name = subject.name.trim().toLowerCase();
  if (list.everyone) return true;
  if (list.names.has(name)) return true;
  const guild = subject.guildName?.trim().toLowerCase();
  if (guild) {
    if (list.guilds.has(guild)) return true;
    const rank = subject.guildRankName?.trim().toLowerCase();
    if (
      rank &&
      list.guildRanks.some(
        (entry) => entry.guild === guild && entry.rank === rank,
      )
    ) {
      return true;
    }
  }
  for (const pattern of list.patterns) {
    if (pattern.regex.test(name)) return pattern.allow;
  }
  return false;
}
