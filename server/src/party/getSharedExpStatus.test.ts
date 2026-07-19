import { describe, expect, it } from "vitest";
import type { Position } from "@tibia/protocol";
import { getSharedExpStatus } from "./getSharedExpStatus";
import { Party } from "./Party";

const NOW = 1_000_000;

function makeParty(memberIds: ReadonlyArray<string>): Party {
  const party = new Party("00000000-0000-4000-8000-000000000001", "leader", NOW);
  for (const memberId of memberIds) party.addMember(memberId, NOW);
  return party;
}

function playersAt(
  entries: Record<string, { level: number; position: Position }>,
) {
  return (playerId: string) => entries[playerId];
}

const ORIGIN: Position = { x: 50, y: 50, z: 7 };

describe("getSharedExpStatus", () => {
  it("reports empty-party for a leader without members", () => {
    const party = makeParty([]);
    const status = getSharedExpStatus(
      party,
      playersAt({ leader: { level: 10, position: ORIGIN } }),
      NOW,
    );
    expect(status).toBe("empty-party");
  });

  it("reports ok when every rule passes", () => {
    const party = makeParty(["member"]);
    const status = getSharedExpStatus(
      party,
      playersAt({
        leader: { level: 30, position: ORIGIN },
        member: { level: 20, position: { x: 60, y: 40, z: 7 } },
      }),
      NOW,
    );
    expect(status).toBe("ok");
  });

  it("enforces the ceil(highest / 1.5) level rule", () => {
    const party = makeParty(["member"]);
    const players = (level: number) =>
      playersAt({
        leader: { level: 30, position: ORIGIN },
        member: { level, position: ORIGIN },
      });
    // ceil(30 / 1.5) = 20: level 19 fails, level 20 passes.
    expect(getSharedExpStatus(party, players(19), NOW)).toBe("level-spread");
    expect(getSharedExpStatus(party, players(20), NOW)).toBe("ok");
  });

  it("requires every member within 30 tiles and one floor of the leader", () => {
    const party = makeParty(["member"]);
    const at = (position: Position) =>
      playersAt({
        leader: { level: 10, position: ORIGIN },
        member: { level: 10, position },
      });
    expect(
      getSharedExpStatus(party, at({ x: 80, y: 50, z: 7 }), NOW),
    ).toBe("ok");
    expect(
      getSharedExpStatus(party, at({ x: 81, y: 50, z: 7 }), NOW),
    ).toBe("too-far-away");
    expect(
      getSharedExpStatus(party, at({ x: 50, y: 50, z: 9 }), NOW),
    ).toBe("too-far-away");
    expect(
      getSharedExpStatus(party, at({ x: 50, y: 50, z: 8 }), NOW),
    ).toBe("ok");
  });

  it("reports inactive once a member idles past two minutes", () => {
    const party = makeParty(["member"]);
    const players = playersAt({
      leader: { level: 10, position: ORIGIN },
      member: { level: 10, position: ORIGIN },
    });
    party.recordActivity("leader", NOW);
    party.recordActivity("member", NOW);
    expect(getSharedExpStatus(party, players, NOW + 120_000)).toBe("ok");
    expect(getSharedExpStatus(party, players, NOW + 120_001)).toBe("inactive");
  });

  it("reports too-far-away when a member is missing from the world", () => {
    const party = makeParty(["member"]);
    const status = getSharedExpStatus(
      party,
      playersAt({ leader: { level: 10, position: ORIGIN } }),
      NOW,
    );
    expect(status).toBe("too-far-away");
  });
});
