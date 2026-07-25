import type { PartyState } from "@tibia/protocol";
import type { PartyView } from "./WorldRenderer";

/**
 * Derives the nameplate shield view from the two party projections the server
 * already scoped to this player: their own party state and the pending
 * invitation addressed to them. Nothing here is inferred about other parties,
 * so the whitish invite shields appear exactly for the two sides of an
 * invitation, as in Canary.
 */
export function derivePartyView(input: {
  readonly party: PartyState | null;
  readonly invitedByLeaderId: string | null;
}): PartyView | null {
  const { party, invitedByLeaderId } = input;
  if (!party && invitedByLeaderId === null) return null;
  return {
    leaderId: party?.leaderId ?? null,
    memberIds: party?.members.map((member) => member.id) ?? [],
    sharedExpActive: party?.sharedExpActive ?? false,
    inviteeIds: party?.invited.map((invitee) => invitee.id) ?? [],
    invitedByLeaderId,
  };
}
