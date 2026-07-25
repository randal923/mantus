import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { FriendService } from "./FriendService";
import { MemoryFriendStore } from "./MemoryFriendStore";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

interface TestPlayer {
  readonly session: Session;
  readonly sent: ServerMessage[];
}

function makeHarness() {
  const world = new World(
    gridMapData({ name: "friends", width: 40, height: 40, blocked: [], floors: [7] }),
    25,
  );
  const sessions = new Map<string, Session>();
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const store = new MemoryFriendStore();
  const service = new FriendService(world, registry, store);
  let nextSpawnX = 4;
  return {
    store,
    service,
    join(id: string, name: string): TestPlayer {
      nextSpawnX += 2;
      const player = new Player(
        makeCharacter(id, name),
        { x: nextSpawnX, y: 4, z: 7 },
        0,
        null,
      );
      world.addPlayer(player);
      store.registerCharacter(id, name);
      const sent: ServerMessage[] = [];
      const session = {
        id: `session-${id}`,
        playerId: id,
        send: (message: ServerMessage) => sent.push(message),
        sendError: () => {},
      } as unknown as Session;
      sessions.set(id, session);
      const testPlayer = { session, sent };
      service.attachCharacter(session, id);
      return testPlayer;
    },
    async flush(now = 0) {
      for (let round = 0; round < 3; round += 1) {
        await service.stop();
        service.applyResolvedOutcomes(now);
      }
    },
  };
}

function stateOf(player: TestPlayer) {
  return player.sent
    .filter(
      (message): message is Extract<ServerMessage, { type: "friend-state" }> =>
        message.type === "friend-state",
    )
    .at(-1);
}

function lastFailure(player: TestPlayer) {
  return player.sent
    .filter(
      (
        message,
      ): message is Extract<ServerMessage, { type: "vip-action-failed" }> =>
        message.type === "vip-action-failed",
    )
    .at(-1);
}

describe("FriendService", () => {
  it("settles a request into a reciprocal friendship on both sides", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    const bob = harness.join(B, "Bob");
    await harness.flush();

    harness.service.handle(
      alice.session,
      { type: "friend-request", name: "Bob" },
      1_000,
    );
    await harness.flush(1_000);
    expect(stateOf(alice)?.outgoing.map((entry) => entry.name)).toEqual(["Bob"]);
    // The target is told, from their own snapshot only.
    expect(stateOf(bob)?.incoming.map((entry) => entry.name)).toEqual(["Alice"]);
    expect(stateOf(bob)?.friends).toEqual([]);

    harness.service.handle(
      bob.session,
      { type: "friend-respond", fromCharacterId: A, accept: true },
      2_000,
    );
    await harness.flush(2_000);
    // Both halves exist: neither side is a friend of a non-friend.
    expect(stateOf(bob)?.friends.map((entry) => entry.name)).toEqual(["Alice"]);
    expect(stateOf(alice)?.friends.map((entry) => entry.name)).toEqual(["Bob"]);
    expect(stateOf(alice)?.outgoing).toEqual([]);
    expect(stateOf(bob)?.incoming).toEqual([]);
  });

  it("rejects accepting a request that was never sent", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    harness.join(C, "Cara");
    await harness.flush();

    // A forged requester id names no row, so nothing is created.
    harness.service.handle(
      alice.session,
      { type: "friend-respond", fromCharacterId: C, accept: true },
      1_000,
    );
    await harness.flush(1_000);
    expect(lastFailure(alice)?.reason).toBe("request-not-found");
    expect(stateOf(alice)?.friends).toEqual([]);
  });

  it("does not leak presence through pending requests", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    const bob = harness.join(B, "Bob");
    await harness.flush();

    harness.service.handle(
      alice.session,
      { type: "friend-request", name: "Bob" },
      1_000,
    );
    await harness.flush(1_000);
    // Bob is online, but a pending request must not say so.
    expect(stateOf(alice)?.outgoing[0]?.online).toBe(false);
    expect(stateOf(bob)?.incoming[0]?.online).toBe(false);

    harness.service.handle(
      bob.session,
      { type: "friend-respond", fromCharacterId: A, accept: true },
      2_000,
    );
    await harness.flush(2_000);
    expect(stateOf(alice)?.friends[0]?.online).toBe(true);
  });

  it("settles crossing requests immediately and unfriends both halves", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    const bob = harness.join(B, "Bob");
    await harness.flush();

    harness.service.handle(
      alice.session,
      { type: "friend-request", name: "Bob" },
      1_000,
    );
    await harness.flush(1_000);
    harness.service.handle(
      bob.session,
      { type: "friend-request", name: "Alice" },
      2_000,
    );
    await harness.flush(2_000);
    expect(stateOf(bob)?.friends.map((entry) => entry.name)).toEqual(["Alice"]);
    expect(stateOf(alice)?.friends.map((entry) => entry.name)).toEqual(["Bob"]);

    harness.service.handle(
      alice.session,
      { type: "friend-remove", targetCharacterId: B },
      3_000,
    );
    await harness.flush(3_000);
    expect(stateOf(alice)?.friends).toEqual([]);
    expect(stateOf(bob)?.friends).toEqual([]);
  });

  it("exposes the finder-visibility switch at query time", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    await harness.flush();
    expect(harness.service.isFinderVisible(A)).toBe(true);

    harness.service.handle(
      alice.session,
      { type: "social-set-settings", finderVisible: false },
      1_000,
    );
    await harness.flush(1_000);
    expect(harness.service.isFinderVisible(A)).toBe(false);
    expect(stateOf(alice)?.finderVisible).toBe(false);
  });
});
