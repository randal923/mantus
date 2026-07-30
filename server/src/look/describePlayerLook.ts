import type { Player } from "../Player";
import { getVocation } from "../progression/getVocation";

/** One party's public size, as Canary's look line reports it. */
export interface PartyLookState {
  readonly members: number;
  readonly invitations: number;
}

/** Live guild identity; Canary prints the rank before the guild name. */
export interface GuildLookState {
  readonly rankName: string;
  readonly guildName: string;
}

export interface PlayerLookState {
  readonly party: PartyLookState | null;
  readonly guild: GuildLookState | null;
}

/** Canary's vocation description: the lowercased name behind its article. */
function vocationDescription(player: Player): string {
  const name = getVocation(player.vocation).client.name.toLowerCase();
  return `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
}

function countLine(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Canary `Player::getDescription`. `self` is the looker looking at their own
 * character (Canary's `lookDistance == -1`), which switches the whole line to
 * second person. Only public state appears here: level, vocation, party size,
 * and guild rank — never health, mana, position, or account data (charter
 * rule 6).
 */
export function describePlayerLook(
  player: Player,
  self: boolean,
  state: PlayerLookState,
): string {
  const pronoun = player.sex === "female" ? "She" : "He";
  const lines: string[] = [];
  lines.push(
    self
      ? `yourself. You are ${vocationDescription(player)}.`
      : `${player.name} (Level ${player.level}). ${pronoun} is ${vocationDescription(player)}.`,
  );

  const party = state.party;
  if (party) {
    const size = countLine(party.members, "member", "members");
    const invitations = countLine(
      party.invitations,
      "pending invitation",
      "pending invitations",
    );
    lines.push(
      self
        ? `Your party has ${size} and ${invitations}.`
        : `${pronoun} is in a party with ${size} and ${invitations}.`,
    );
  }

  const guild = state.guild;
  if (guild) {
    const rank = guild.rankName ? `${guild.rankName} of` : "a member of";
    lines.push(
      self
        ? `You are ${rank} the ${guild.guildName}.`
        : `${pronoun} is ${rank} the ${guild.guildName}.`,
    );
  }

  return lines.join(" ");
}
