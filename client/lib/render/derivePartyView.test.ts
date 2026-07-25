import { describe, expect, it } from "vitest";
import type { PartyState } from "@tibia/protocol";
import { derivePartyView } from "./derivePartyView";

const party: PartyState = {
  partyId: "00000000-0000-4000-8000-00000000000f",
  leaderId: "leader",
  sharedExpActive: true,
  sharedExpStatus: "ok",
  members: [
    {
      id: "leader",
      name: "Leader",
      level: 50,
      vocation: "Knight",
      isLeader: true,
      healthPercent: 100,
      manaPercent: 100,
      eligibleForSharedExp: true,
    },
    {
      id: "mate",
      name: "Mate",
      level: 48,
      vocation: "Druid",
      isLeader: false,
      healthPercent: 100,
      manaPercent: 100,
      eligibleForSharedExp: true,
    },
  ],
  invited: [{ id: "invitee", name: "Invitee" }],
};

describe("derivePartyView", () => {
  it("carries the own party's members and its pending invitees", () => {
    expect(derivePartyView({ party, invitedByLeaderId: null })).toEqual({
      leaderId: "leader",
      memberIds: ["leader", "mate"],
      sharedExpActive: true,
      inviteeIds: ["invitee"],
      invitedByLeaderId: null,
    });
  });

  it("carries an inviting leader with no party of its own", () => {
    expect(
      derivePartyView({ party: null, invitedByLeaderId: "other-leader" }),
    ).toEqual({
      leaderId: null,
      memberIds: [],
      sharedExpActive: false,
      inviteeIds: [],
      invitedByLeaderId: "other-leader",
    });
  });

  it("has no view at all with neither a party nor an invitation", () => {
    expect(derivePartyView({ party: null, invitedByLeaderId: null })).toBeNull();
  });
});
