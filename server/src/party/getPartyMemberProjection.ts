import type { CharacterVocation, PartyMemberEntry } from "@tibia/protocol";

/**
 * Projects one member for one recipient. Health and mana are nulled unless
 * the member is within the recipient's status range — the projection never
 * carries more than that recipient may see (charter rule 6).
 */
export function getPartyMemberProjection(input: {
  id: string;
  name: string;
  level: number;
  vocation: CharacterVocation;
  isLeader: boolean;
  eligibleForSharedExp: boolean;
  withinRecipientRange: boolean;
  healthPercent: number;
  manaPercent: number;
}): PartyMemberEntry {
  return {
    id: input.id,
    name: input.name,
    level: input.level,
    vocation: input.vocation,
    isLeader: input.isLeader,
    healthPercent: input.withinRecipientRange ? input.healthPercent : null,
    manaPercent: input.withinRecipientRange ? input.manaPercent : null,
    eligibleForSharedExp: input.eligibleForSharedExp,
  };
}
