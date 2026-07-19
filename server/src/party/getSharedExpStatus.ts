import type { PartySharedExpStatus, Position } from "@tibia/protocol";
import { isWithinPartyStatusRange } from "./isWithinPartyStatusRange";
import type { Party } from "./Party";

/** Canary: a member must have fought or healed within the last two minutes. */
const SHARED_EXP_ACTIVITY_WINDOW_MS = 120_000;
/** Canary minimum-level rule: everyone at least ceil(highest / 1.5). */
const SHARED_EXP_LEVEL_DIVISOR = 1.5;

/**
 * Recomputes shared-experience eligibility from live state (all-or-nothing,
 * checked for every member including the leader). Pure so the kill path can
 * re-check at execution time inside the tick.
 */
export function getSharedExpStatus(
  party: Party,
  getPlayer: (
    playerId: string,
  ) => { level: number; position: Position } | undefined,
  now: number,
): PartySharedExpStatus {
  if (party.memberIds.length === 0) return "empty-party";
  const leader = getPlayer(party.leaderId);
  if (!leader) return "too-far-away";
  const members = party.allMemberIds().map((memberId) => ({
    memberId,
    player: getPlayer(memberId),
  }));
  let highestLevel = 0;
  for (const member of members) {
    if (!member.player) return "too-far-away";
    highestLevel = Math.max(highestLevel, member.player.level);
  }
  const minimumLevel = Math.ceil(highestLevel / SHARED_EXP_LEVEL_DIVISOR);
  for (const member of members) {
    if (!member.player) return "too-far-away";
    if (member.player.level < minimumLevel) return "level-spread";
    if (!isWithinPartyStatusRange(leader.position, member.player.position)) {
      return "too-far-away";
    }
    if (now - party.activityAt(member.memberId) > SHARED_EXP_ACTIVITY_WINDOW_MS) {
      return "inactive";
    }
  }
  return "ok";
}
