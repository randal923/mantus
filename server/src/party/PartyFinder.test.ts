import { describe, expect, it, vi } from "vitest";
import { PARTY_FINDER_LIMITS, type ServerMessage } from "@tibia/protocol";
import type { WebSocket } from "ws";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { Session } from "../Session";
import { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { PartyHandler } from "./PartyHandler";

function makeHarness(
  options: { finderVisible?: (characterId: string) => boolean } = {},
) {
  const world = new World(
    gridMapData({ name: "test", width: 12, height: 10, blocked: [], items: [] }),
    25,
  );
  const registry = new SessionRegistry();
  const parties = new PartyHandler(
    world,
    registry,
    new Visibility(world, registry),
    undefined,
    undefined,
    options.finderVisible,
  );
  let column = 1;
  const join = (characterId: string, level = 1) => {
    const player = new Player(
      {
        ...makeCharacter(characterId),
        level,
        experience: BigInt(getExperienceForLevel(level)),
      },
      { x: column++, y: 5, z: 7 },
    );
    world.addPlayer(player);
    const sent: ServerMessage[] = [];
    const socket = {
      OPEN: 1,
      readyState: 1,
      on: vi.fn(),
      send: vi.fn((value: string) => {
        sent.push(JSON.parse(value) as ServerMessage);
      }),
    } as unknown as WebSocket;
    const session = new Session(characterId, "127.0.0.1", socket, {
      maxPendingIntents: 16,
      maxProtocolViolations: 5,
      initialViewRange: { x: 9, y: 7 },
    });
    session.playerId = characterId;
    registry.add(session);
    registry.bindPlayer(session);
    return { player, session, sent };
  };
  return { world, parties, join };
}

const listings = (sent: ReadonlyArray<ServerMessage>) =>
  sent.filter(
    (message): message is Extract<
      ServerMessage,
      { type: "party-finder-listing" }
    > => message.type === "party-finder-listing",
  );

/** A leader with a party of one and a published advert. */
function advertisedLeader(
  harness: ReturnType<typeof makeHarness>,
  characterId: string,
  advert: { title: string; minLevel?: number; maxLevel?: number },
  level = 50,
) {
  const leader = harness.join(characterId, level);
  const member = harness.join(`${characterId}-mate`, level);
  harness.parties.handle(
    leader.session,
    { type: "party-invite", targetName: member.player.name },
    1_000,
  );
  harness.parties.handle(
    member.session,
    { type: "party-respond-invite", leaderId: leader.player.id, accept: true },
    1_600,
  );
  harness.parties.handle(
    leader.session,
    { type: "party-finder-advertise", ...advert },
    2_000,
  );
  return leader;
}

describe("party finder", () => {
  it("lists an advertised party with advert data only", () => {
    const harness = makeHarness();
    const leader = advertisedLeader(harness, "leader", {
      title: "Dragon lair, 2 spots",
      minLevel: 40,
      maxLevel: 80,
    });
    const searcher = harness.join("searcher", 50);

    harness.parties.handle(
      searcher.session,
      { type: "party-finder-list", forOwnLevel: false },
      3_000,
    );

    const listing = listings(searcher.sent).at(-1);
    expect(listing?.truncated).toBe(false);
    expect(listing?.entries).toEqual([
      {
        partyId: expect.any(String) as unknown as string,
        leaderId: leader.player.id,
        leaderName: leader.player.name,
        title: "Dragon lair, 2 spots",
        memberCount: 2,
        minLevel: 40,
        maxLevel: 80,
      },
    ]);
  });

  it("never lists an unadvertised party", () => {
    const harness = makeHarness();
    const leader = harness.join("leader", 50);
    const member = harness.join("member", 50);
    harness.parties.handle(
      leader.session,
      { type: "party-invite", targetName: member.player.name },
      1_000,
    );
    harness.parties.handle(
      member.session,
      { type: "party-respond-invite", leaderId: leader.player.id, accept: true },
      1_600,
    );
    const searcher = harness.join("searcher", 50);

    harness.parties.handle(
      searcher.session,
      { type: "party-finder-list", forOwnLevel: false },
      3_000,
    );

    expect(listings(searcher.sent).at(-1)?.entries).toEqual([]);
  });

  it("honours finder visibility at query time, not at advertise time", () => {
    let visible = true;
    const harness = makeHarness({ finderVisible: () => visible });
    advertisedLeader(harness, "leader", { title: "Hunt" });
    const searcher = harness.join("searcher", 50);

    harness.parties.handle(
      searcher.session,
      { type: "party-finder-list", forOwnLevel: false },
      3_000,
    );
    expect(listings(searcher.sent).at(-1)?.entries).toHaveLength(1);

    visible = false;
    harness.parties.handle(
      searcher.session,
      { type: "party-finder-list", forOwnLevel: false },
      4_000,
    );
    expect(listings(searcher.sent).at(-1)?.entries).toEqual([]);
  });

  it("filters by the searcher's own level when asked", () => {
    const harness = makeHarness();
    advertisedLeader(harness, "high", { title: "High level", minLevel: 200 });
    advertisedLeader(harness, "low", { title: "Any level" });
    const searcher = harness.join("searcher", 50);

    harness.parties.handle(
      searcher.session,
      { type: "party-finder-list", forOwnLevel: true },
      3_000,
    );

    expect(
      listings(searcher.sent).at(-1)?.entries.map((entry) => entry.title),
    ).toEqual(["Any level"]);
  });

  it("clears the advert when the leader publishes no title", () => {
    const harness = makeHarness();
    const leader = advertisedLeader(harness, "leader", { title: "Hunt" });
    const searcher = harness.join("searcher", 50);

    harness.parties.handle(
      leader.session,
      { type: "party-finder-advertise" },
      3_000,
    );
    harness.parties.handle(
      searcher.session,
      { type: "party-finder-list", forOwnLevel: false },
      4_000,
    );

    expect(listings(searcher.sent).at(-1)?.entries).toEqual([]);
  });

  it("rejects an advert from a non-leader and an inverted level range", () => {
    const harness = makeHarness();
    const leader = harness.join("leader", 50);
    const member = harness.join("member", 50);
    harness.parties.handle(
      leader.session,
      { type: "party-invite", targetName: member.player.name },
      1_000,
    );
    harness.parties.handle(
      member.session,
      { type: "party-respond-invite", leaderId: leader.player.id, accept: true },
      1_600,
    );

    harness.parties.handle(
      member.session,
      { type: "party-finder-advertise", title: "Sneaky" },
      3_000,
    );
    harness.parties.handle(
      leader.session,
      {
        type: "party-finder-advertise",
        title: "Broken",
        minLevel: 90,
        maxLevel: 10,
      },
      3_000,
    );

    expect(
      member.sent.filter((message) => message.type === "party-action-failed"),
    ).toMatchObject([{ reason: "not-leader" }]);
    expect(
      leader.sent.filter((message) => message.type === "party-action-failed"),
    ).toMatchObject([{ reason: "invalid-advert" }]);
  });

  it("caps the listing and reports the truncation", () => {
    const harness = makeHarness();
    for (let index = 0; index <= PARTY_FINDER_LIMITS.maxListings; index += 1) {
      advertisedLeader(harness, `leader-${index}`, { title: `Hunt ${index}` });
    }
    const searcher = harness.join("searcher", 50);

    harness.parties.handle(
      searcher.session,
      { type: "party-finder-list", forOwnLevel: false },
      3_000,
    );

    const listing = listings(searcher.sent).at(-1);
    expect(listing?.entries).toHaveLength(PARTY_FINDER_LIMITS.maxListings);
    expect(listing?.truncated).toBe(true);
  });

  it("omits the searcher's own party from the listing", () => {
    const harness = makeHarness();
    const leader = advertisedLeader(harness, "leader", { title: "Own hunt" });

    harness.parties.handle(
      leader.session,
      { type: "party-finder-list", forOwnLevel: false },
      3_000,
    );

    expect(listings(leader.sent).at(-1)?.entries).toEqual([]);
  });
});
