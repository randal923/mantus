import { describe, expect, it } from "vitest";
import type { AccountTier, ServerMessage } from "@tibia/protocol";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { MemoryVipStore } from "./MemoryVipStore";
import { VipService } from "./VipService";

interface TestPlayer {
  readonly session: Session;
  readonly sent: ServerMessage[];
}

interface Harness {
  readonly store: MemoryVipStore;
  readonly service: VipService;
  join(id: string, name: string, accountTier?: AccountTier): TestPlayer;
  leave(playerId: string): void;
  flush(now?: number): Promise<void>;
}

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

function makeHarness(): Harness {
  const world = new World(
    gridMapData({
      name: "vip-test",
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
  const store = new MemoryVipStore();
  const service = new VipService(world, registry, store);
  let nextSpawnX = 40;
  return {
    store,
    service,
    join(id, name, accountTier = "free") {
      nextSpawnX += 2;
      const player = new Player(
        makeCharacter(id, name),
        { x: nextSpawnX, y: 50, z: 7 },
        0,
      );
      world.addPlayer(player);
      store.registerCharacter(id, name);
      const sent: ServerMessage[] = [];
      const session = {
        id: `session-${id}`,
        playerId: id,
        account: {
          id: `account-${id}`,
          supabaseUserId: `user-${id}`,
          email: null,
          bannedUntil: null,
          premiumUntil:
            accountTier === "premium"
              ? new Date("2100-01-01T00:00:00.000Z")
              : null,
          language: "en",
          uiSettings: {},
        },
        send: (message: ServerMessage) => sent.push(message),
        sendError: () => {},
      } as unknown as Session;
      sessions.set(id, session);
      service.attachCharacter(session, id);
      return { session, sent };
    },
    leave(playerId) {
      service.detachCharacter(playerId);
      sessions.delete(playerId);
      world.removePlayer(playerId);
    },
    async flush(now = 0) {
      for (let round = 0; round < 3; round += 1) {
        await service.stop();
        service.applyResolvedOutcomes(now);
      }
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

describe("VipService", () => {
  it("enforces 20 free entries while premium accounts can add more", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    await harness.flush();

    for (let index = 0; index < 21; index += 1) {
      const targetId = `target-${index}`;
      const targetName = `Friend ${String.fromCharCode(65 + index)}`;
      harness.store.registerCharacter(targetId, targetName);
      harness.service.handle(
        alice.session,
        { type: "vip-add", name: targetName },
        (index + 1) * 1_000,
      );
      await harness.flush((index + 1) * 1_000);
    }

    expect(messagesOf(alice, "vip-state").at(-1)?.entries).toHaveLength(20);
    expect(messagesOf(alice, "vip-action-failed").at(-1)?.reason).toBe(
      "list-full",
    );

    const premiumHarness = makeHarness();
    const premiumAlice = premiumHarness.join(A, "Alice", "premium");
    await premiumHarness.flush();
    for (let index = 0; index < 21; index += 1) {
      const targetId = `premium-target-${index}`;
      const targetName = `Premium Friend ${String.fromCharCode(65 + index)}`;
      premiumHarness.store.registerCharacter(targetId, targetName);
      premiumHarness.service.handle(
        premiumAlice.session,
        { type: "vip-add", name: targetName },
        (index + 1) * 1_000,
      );
      await premiumHarness.flush((index + 1) * 1_000);
    }
    expect(
      messagesOf(premiumAlice, "vip-state").at(-1)?.entries,
    ).toHaveLength(21);
  });

  it("sends the private list only to its owner and adds entries", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    const bob = harness.join(B, "Bob");
    await harness.flush();

    harness.service.handle(
      alice.session,
      { type: "vip-add", name: "Bob" },
      1_000,
    );
    await harness.flush(1_000);

    const state = messagesOf(alice, "vip-state").at(-1);
    expect(state?.entries).toEqual([
      {
        characterId: B,
        name: "Bob",
        online: true,
        description: "",
        icon: 0,
        notifyLogin: false,
      },
    ]);
    // Over-share check: nothing about Alice's list ever reaches Bob.
    expect(
      messagesOf(bob, "vip-state").every((message) =>
        message.entries.every((entry) => entry.characterId !== B),
      ),
    ).toBe(true);
  });

  it("pushes presence only to watchers that listed the character", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    const carol = harness.join(C, "Carol");
    // Bob exists as a character but is offline for now.
    harness.store.registerCharacter(B, "Bob");
    await harness.flush();
    harness.service.handle(
      alice.session,
      { type: "vip-add", name: "Bob" },
      1_000,
    );
    await harness.flush(1_000);

    const bob = harness.join(B, "Bob");
    await harness.flush(2_000);
    expect(messagesOf(alice, "vip-status-changed")).toEqual([
      { type: "vip-status-changed", characterId: B, online: true },
    ]);
    // Carol never listed Bob: she learns nothing about his presence.
    expect(messagesOf(carol, "vip-status-changed")).toHaveLength(0);
    expect(bob.sent.some((message) => message.type === "vip-status-changed")).toBe(
      false,
    );

    harness.leave(B);
    expect(messagesOf(alice, "vip-status-changed").at(-1)).toEqual({
      type: "vip-status-changed",
      characterId: B,
      online: false,
    });
    expect(messagesOf(carol, "vip-status-changed")).toHaveLength(0);
  });

  it("rejects self, unknown names, duplicates, and rapid mutations", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    harness.join(B, "Bob");
    await harness.flush();

    harness.service.handle(
      alice.session,
      { type: "vip-add", name: "Alice" },
      1_000,
    );
    await harness.flush(1_000);
    harness.service.handle(
      alice.session,
      { type: "vip-add", name: "Nobody" },
      2_000,
    );
    await harness.flush(2_000);
    harness.service.handle(
      alice.session,
      { type: "vip-add", name: "Bob" },
      3_000,
    );
    await harness.flush(3_000);
    harness.service.handle(
      alice.session,
      { type: "vip-add", name: "Bob" },
      4_000,
    );
    await harness.flush(4_000);
    // Within the 500 ms cooldown of the previous mutation.
    harness.service.handle(
      alice.session,
      { type: "vip-add", name: "Bob" },
      4_100,
    );
    await harness.flush(4_100);

    const reasons = messagesOf(alice, "vip-action-failed").map(
      (message) => message.reason,
    );
    expect(reasons).toEqual([
      "cannot-add-self",
      "not-found",
      "already-added",
      "rate-limited",
    ]);
  });

  it("edits and removes entries, updating presence watching", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    harness.join(B, "Bob");
    await harness.flush();
    harness.service.handle(
      alice.session,
      { type: "vip-add", name: "Bob" },
      1_000,
    );
    await harness.flush(1_000);

    harness.service.handle(
      alice.session,
      {
        type: "vip-edit",
        targetCharacterId: B,
        description: "hunt buddy",
        icon: 4,
        notifyLogin: true,
      },
      2_000,
    );
    await harness.flush(2_000);
    expect(messagesOf(alice, "vip-state").at(-1)?.entries[0]).toMatchObject({
      description: "hunt buddy",
      icon: 4,
      notifyLogin: true,
    });

    harness.service.handle(
      alice.session,
      { type: "vip-remove", targetCharacterId: B },
      3_000,
    );
    await harness.flush(3_000);
    expect(messagesOf(alice, "vip-state").at(-1)?.entries).toHaveLength(0);

    // Removed entries no longer produce presence pushes.
    harness.leave(B);
    harness.join(B, "Bob");
    await harness.flush(4_000);
    expect(
      messagesOf(alice, "vip-status-changed").filter((message) => message.online),
    ).toHaveLength(0);
  });

  it("reloads the list on login so offline edits survive", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    harness.join(B, "Bob");
    await harness.flush();
    harness.service.handle(
      alice.session,
      { type: "vip-add", name: "Bob" },
      1_000,
    );
    await harness.flush(1_000);
    harness.leave(A);

    const aliceAgain = harness.join(A, "Alice");
    await harness.flush(2_000);
    expect(
      messagesOf(aliceAgain, "vip-state").at(-1)?.entries.map((entry) => entry.name),
    ).toEqual(["Bob"]);
  });
});
