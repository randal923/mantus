import { describe, expect, it } from "vitest";
import type { Position, ServerMessage } from "@tibia/protocol";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { PartyHandler } from "./PartyHandler";

interface TestPlayer {
  readonly player: Player;
  readonly session: Session;
  readonly sent: ServerMessage[];
}

interface Harness {
  readonly world: World;
  readonly handler: PartyHandler;
  join(id: string, name: string, position: Position): TestPlayer;
  leave(playerId: string): void;
}

function makeHarness(): Harness {
  const world = new World(
    gridMapData({
      name: "party-test",
      width: 100,
      height: 100,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const sessions = new Map<string, Session>();
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registry);
  const handler = new PartyHandler(world, registry, visibility);
  return {
    world,
    handler,
    join(id, name, position) {
      const player = new Player(makeCharacter(id, name), position, 0);
      world.addPlayer(player);
      const sent: ServerMessage[] = [];
      const session = {
        id: `session-${id}`,
        playerId: id,
        viewRange: { x: 8, y: 6 },
        knownCreatureIds: new Set([id]),
        knownMapItemTiles: new Map(),
        attackTargetId: null,
        send: (message: ServerMessage) => sent.push(message),
        sendError: () => {},
      } as unknown as Session;
      sessions.set(id, session);
      return { player, session, sent };
    },
    leave(playerId) {
      sessions.delete(playerId);
      world.removePlayer(playerId);
    },
  };
}

function messagesOf<TType extends ServerMessage["type"]>(
  testPlayer: TestPlayer,
  type: TType,
): Array<Extract<ServerMessage, { type: TType }>> {
  return testPlayer.sent.filter(
    (message): message is Extract<ServerMessage, { type: TType }> =>
      message.type === type,
  );
}

function lastPartyState(testPlayer: TestPlayer) {
  const states = messagesOf(testPlayer, "party-state");
  return states[states.length - 1];
}

describe("PartyHandler", () => {
  const A = "00000000-0000-4000-8000-00000000000a";
  const B = "00000000-0000-4000-8000-00000000000b";
  const C = "00000000-0000-4000-8000-00000000000c";
  const D = "00000000-0000-4000-8000-00000000000d";

  function formParty(
    harness: Harness,
    leader: TestPlayer,
    members: ReadonlyArray<TestPlayer>,
    clock: { now: number },
  ): void {
    for (const member of members) {
      clock.now += 600;
      harness.handler.handle(
        leader.session,
        { type: "party-invite", targetName: member.player.name },
        clock.now,
      );
      clock.now += 600;
      harness.handler.handle(
        member.session,
        {
          type: "party-respond-invite",
          leaderId: leader.player.id,
          accept: true,
        },
        clock.now,
      );
    }
    harness.handler.tick(clock.now);
  }

  it("rejects forged leader and target ids with party-action-failed", () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    const alice = harness.join(A, "Alice", { x: 50, y: 50, z: 7 });
    const bob = harness.join(B, "Bob", { x: 51, y: 50, z: 7 });
    const carol = harness.join(C, "Carol", { x: 52, y: 50, z: 7 });

    // Invite by a name that is not online.
    harness.handler.handle(
      alice.session,
      { type: "party-invite", targetName: "Nobody" },
      clock.now,
    );
    expect(lastFailure(alice)).toBe("target-not-found");

    // Accepting an invitation from a fabricated leader id.
    clock.now += 600;
    harness.handler.handle(
      bob.session,
      { type: "party-respond-invite", leaderId: "forged-leader", accept: true },
      clock.now,
    );
    expect(lastFailure(bob)).toBe("not-invited");

    formParty(harness, alice, [bob], clock);

    // A non-member cannot kick anyone.
    clock.now += 600;
    harness.handler.handle(
      carol.session,
      { type: "party-kick", targetPlayerId: B },
      clock.now,
    );
    expect(lastFailure(carol)).toBe("not-in-party");

    // A member who is not the leader cannot revoke invites.
    clock.now += 600;
    harness.handler.handle(
      bob.session,
      { type: "party-revoke-invite", targetPlayerId: C },
      clock.now,
    );
    expect(lastFailure(bob)).toBe("not-leader");

    // The leader cannot kick a fabricated non-member id.
    clock.now += 600;
    harness.handler.handle(
      alice.session,
      { type: "party-kick", targetPlayerId: D },
      clock.now,
    );
    expect(lastFailure(alice)).toBe("target-not-member");

    // The leader cannot kick or pass leadership to itself.
    clock.now += 600;
    harness.handler.handle(
      alice.session,
      { type: "party-kick", targetPlayerId: A },
      clock.now,
    );
    expect(lastFailure(alice)).toBe("invalid-target");
  });

  it("stops sending party-state and party-chat to a kicked member", () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    const alice = harness.join(A, "Alice", { x: 50, y: 50, z: 7 });
    const bob = harness.join(B, "Bob", { x: 51, y: 50, z: 7 });
    const carol = harness.join(C, "Carol", { x: 52, y: 50, z: 7 });
    formParty(harness, alice, [bob, carol], clock);

    clock.now += 600;
    harness.handler.handle(
      alice.session,
      { type: "party-kick", targetPlayerId: C },
      clock.now,
    );
    harness.handler.tick(clock.now);
    const kickNotice = lastPartyState(carol);
    expect(kickNotice?.party).toBeNull();
    expect(harness.world.getPlayer(C)?.partyMember).toBe(false);

    alice.sent.length = 0;
    bob.sent.length = 0;
    carol.sent.length = 0;

    clock.now += 1_100;
    harness.handler.tick(clock.now);
    harness.handler.handle(
      alice.session,
      { type: "party-chat", text: "secret plans" },
      clock.now,
    );
    expect(messagesOf(alice, "party-state").length).toBeGreaterThan(0);
    expect(messagesOf(bob, "party-chat-delivered")).toHaveLength(1);
    expect(messagesOf(carol, "party-state")).toHaveLength(0);
    expect(messagesOf(carol, "party-chat-delivered")).toHaveLength(0);

    // The kicked player can no longer speak in the party either.
    clock.now += 600;
    harness.handler.handle(
      carol.session,
      { type: "party-chat", text: "let me back in" },
      clock.now,
    );
    expect(lastFailure(carol)).toBe("not-in-party");
  });

  it("nulls hp/mana for members outside the recipient's status range", () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    const alice = harness.join(A, "Alice", { x: 50, y: 50, z: 7 });
    const bob = harness.join(B, "Bob", { x: 60, y: 50, z: 7 });
    const carol = harness.join(C, "Carol", { x: 85, y: 50, z: 7 });
    harness.join(D, "Dave", { x: 50, y: 51, z: 7 });
    formParty(harness, alice, [bob, carol], clock);

    clock.now += 1_100;
    harness.handler.tick(clock.now);

    const aliceView = lastPartyState(alice)?.party;
    expect(aliceView).toBeDefined();
    const aliceSeesBob = aliceView?.members.find((member) => member.id === B);
    const aliceSeesCarol = aliceView?.members.find(
      (member) => member.id === C,
    );
    // Bob is 10 tiles away: numbers visible. Carol is 35 tiles away: hidden.
    expect(aliceSeesBob?.healthPercent).toBe(100);
    expect(aliceSeesBob?.manaPercent).not.toBeNull();
    expect(aliceSeesCarol?.healthPercent).toBeNull();
    expect(aliceSeesCarol?.manaPercent).toBeNull();

    const carolView = lastPartyState(carol)?.party;
    const carolSeesAlice = carolView?.members.find(
      (member) => member.id === A,
    );
    const carolSeesBob = carolView?.members.find((member) => member.id === B);
    const carolSeesSelf = carolView?.members.find((member) => member.id === C);
    expect(carolSeesAlice?.healthPercent).toBeNull();
    expect(carolSeesBob?.healthPercent).toBe(100);
    expect(carolSeesSelf?.healthPercent).toBe(100);

    // Out-of-range members break shared-exp eligibility for everyone.
    expect(aliceView?.sharedExpStatus).toBe("too-far-away");
  });

  it("never sends party-state to non-members", () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    const alice = harness.join(A, "Alice", { x: 50, y: 50, z: 7 });
    const bob = harness.join(B, "Bob", { x: 51, y: 50, z: 7 });
    const dave = harness.join(D, "Dave", { x: 50, y: 51, z: 7 });
    formParty(harness, alice, [bob], clock);
    clock.now += 1_100;
    harness.handler.tick(clock.now);
    clock.now += 600;
    harness.handler.handle(
      alice.session,
      { type: "party-chat", text: "hello party" },
      clock.now,
    );
    expect(messagesOf(dave, "party-state")).toHaveLength(0);
    expect(messagesOf(dave, "party-chat-delivered")).toHaveLength(0);
    expect(messagesOf(dave, "party-invitation")).toHaveLength(0);
  });

  it("promotes the front-most member when the leader logs out", () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    const alice = harness.join(A, "Alice", { x: 50, y: 50, z: 7 });
    const bob = harness.join(B, "Bob", { x: 51, y: 50, z: 7 });
    const carol = harness.join(C, "Carol", { x: 52, y: 50, z: 7 });
    formParty(harness, alice, [bob, carol], clock);

    clock.now += 600;
    harness.handler.detachCharacter(A, clock.now);
    harness.leave(A);
    harness.handler.tick(clock.now);

    const bobView = lastPartyState(bob)?.party;
    expect(bobView?.leaderId).toBe(B);
    expect(bobView?.members.map((member) => member.id)).toEqual([B, C]);
  });

  it("enforces the per-session mutation cooldown", () => {
    const harness = makeHarness();
    const clock = { now: 1_000_000 };
    const alice = harness.join(A, "Alice", { x: 50, y: 50, z: 7 });
    harness.join(B, "Bob", { x: 51, y: 50, z: 7 });
    harness.handler.handle(
      alice.session,
      { type: "party-invite", targetName: "Bob" },
      clock.now,
    );
    harness.handler.handle(
      alice.session,
      { type: "party-invite", targetName: "Bob" },
      clock.now + 100,
    );
    expect(lastFailure(alice)).toBe("rate-limited");
  });
});

function lastFailure(testPlayer: TestPlayer) {
  const failures = testPlayer.sent.filter(
    (message): message is Extract<ServerMessage, { type: "party-action-failed" }> =>
      message.type === "party-action-failed",
  );
  return failures[failures.length - 1]?.reason;
}
