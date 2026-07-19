import type { CharacterVocation } from "@tibia/protocol";

/** Promotions share their base vocation for the unique-vocation bonus. */
const BASE_VOCATIONS: Readonly<
  Partial<Record<CharacterVocation, CharacterVocation>>
> = {
  "Elite Knight": "Knight",
  "Royal Paladin": "Paladin",
  "Master Sorcerer": "Sorcerer",
  "Elder Druid": "Druid",
  "Exalted Monk": "Monk",
};

const MAX_COUNTED_VOCATIONS = 4;
const LARGE_PARTY_SIZE = 4;
const LARGE_PARTY_PENALTY = 0.1;

/**
 * Splits one monster's experience across the whole party (leader included).
 * Multiplier 0.1·V² − 0.2·V + 1.3 with V = unique base vocations capped at 4,
 * minus 0.1 for parties of four or more, so V = 1/2/3/4 → 1.2/1.3/1.6/2.0
 * at the matching sizes. Each share is ceil(exp · mult / size).
 */
export function getPartyExperienceShares(
  members: ReadonlyArray<{
    playerId: string;
    vocation: CharacterVocation;
  }>,
  baseExperience: number,
): Array<{ playerId: string; amount: number }> {
  const uniqueVocations = new Set(
    members.map((member) => BASE_VOCATIONS[member.vocation] ?? member.vocation),
  );
  const counted = Math.min(MAX_COUNTED_VOCATIONS, uniqueVocations.size);
  let multiplier = 0.1 * counted * counted - 0.2 * counted + 1.3;
  if (members.length >= LARGE_PARTY_SIZE) multiplier -= LARGE_PARTY_PENALTY;
  const amount = Math.ceil((baseExperience * multiplier) / members.length);
  return members.map((member) => ({ playerId: member.playerId, amount }));
}
