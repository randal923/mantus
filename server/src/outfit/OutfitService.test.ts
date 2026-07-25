import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { MemoryOutfitStore } from "./MemoryOutfitStore";
import { OutfitService } from "./OutfitService";

const A = "00000000-0000-4000-8000-00000000000a";

function makeHarness() {
  const world = new World(
    gridMapData({ name: "outfits", width: 40, height: 40, blocked: [], floors: [7] }),
    25,
  );
  const sessions = new Map<string, Session>();
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registry);
  const persistence = { markDirty: () => {} } as unknown as CharacterPersistence;
  const store = new MemoryOutfitStore();
  const service = new OutfitService(
    world,
    registry,
    visibility,
    persistence,
    store,
  );
  return {
    world,
    store,
    service,
    join(id: string, name: string) {
      const player = new Player(
        makeCharacter(id, name),
        { x: 6, y: 6, z: 7 },
        0,
        null,
      );
      world.addPlayer(player);
      const sent: ServerMessage[] = [];
      const session = {
        id: `session-${id}`,
        playerId: id,
        viewRange: { x: 8, y: 6 },
        knownCreatureIds: new Set([id]),
        send: (message: ServerMessage) => sent.push(message),
        sendSerialized: (message: string) =>
          sent.push(JSON.parse(message) as ServerMessage),
        sendError: () => {},
      } as unknown as Session;
      sessions.set(id, session);
      service.attachCharacter(session, id);
      return { player, session, sent };
    },
    async flush() {
      for (let round = 0; round < 4; round += 1) {
        await service.stop();
        service.applyResolvedOutcomes();
      }
    },
  };
}

const lastOf = <TType extends ServerMessage["type"]>(
  sent: ServerMessage[],
  type: TType,
): Extract<ServerMessage, { type: TType }> | undefined =>
  sent
    .filter(
      (message): message is Extract<ServerMessage, { type: TType }> =>
        message.type === type,
    )
    .at(-1);

describe("OutfitService", () => {
  it("refuses an outfit the character does not own", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    await harness.flush();
    const before = alice.player.outfit.lookType;

    harness.service.handle(
      alice.session,
      {
        type: "outfit-select",
        lookType: 134,
        head: 0,
        body: 0,
        legs: 0,
        feet: 0,
        addons: 0,
        mountId: 0,
      },
      1_000,
    );
    await harness.flush();
    expect(lastOf(alice.sent, "outfit-action-failed")?.reason).toBe("not-owned");
    // The unowned outfit never reached the world.
    expect(alice.player.outfit.lookType).toBe(before);
  });

  it("refuses an outfit outside the pinned catalog before touching storage", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    await harness.flush();

    harness.service.handle(
      alice.session,
      {
        type: "outfit-select",
        lookType: 65_535,
        head: 0,
        body: 0,
        legs: 0,
        feet: 0,
        addons: 0,
        mountId: 0,
      },
      1_000,
    );
    await harness.flush();
    expect(lastOf(alice.sent, "outfit-action-failed")?.reason).toBe("not-owned");
    expect(harness.store.selections.get(A)).toBeUndefined();
  });

  it("refuses an addon bit the grant did not include", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    await harness.flush();
    harness.service.grantOutfit(A, 134, 1);
    await harness.flush();

    harness.service.handle(
      alice.session,
      {
        type: "outfit-select",
        lookType: 134,
        head: 0,
        body: 0,
        legs: 0,
        feet: 0,
        addons: 3,
        mountId: 0,
      },
      1_000,
    );
    await harness.flush();
    expect(lastOf(alice.sent, "outfit-action-failed")?.reason).toBe("not-owned");

    harness.service.handle(
      alice.session,
      {
        type: "outfit-select",
        lookType: 134,
        head: 0,
        body: 0,
        legs: 0,
        feet: 0,
        addons: 1,
        mountId: 0,
      },
      3_000,
    );
    await harness.flush();
    expect(alice.player.outfit.lookType).toBe(134);
    expect(alice.player.outfit.addons).toBe(1);
  });

  it("applies a mount's server-side speed only once it is owned", async () => {
    const harness = makeHarness();
    const alice = harness.join(A, "Alice");
    await harness.flush();
    const baseSpeed = alice.player.stepSpeed;

    // Claiming a mount you do not own changes neither look nor speed.
    harness.service.handle(
      alice.session,
      {
        type: "outfit-select",
        lookType: 128,
        head: 0,
        body: 0,
        legs: 0,
        feet: 0,
        addons: 0,
        mountId: 5,
      },
      1_000,
    );
    await harness.flush();
    expect(lastOf(alice.sent, "outfit-action-failed")?.reason).toBe("not-owned");
    expect(alice.player.mountId).toBe(0);
    expect(alice.player.stepSpeed).toBe(baseSpeed);

    harness.service.grantMount(A, 5);
    await harness.flush();
    harness.service.handle(
      alice.session,
      {
        type: "outfit-select",
        lookType: 128,
        head: 0,
        body: 0,
        legs: 0,
        feet: 0,
        addons: 0,
        mountId: 5,
      },
      3_000,
    );
    await harness.flush();
    expect(alice.player.mountId).toBe(5);
    // Midnight Panther grants 20 speed points, from the pinned catalog.
    expect(alice.player.stepSpeed).toBe(baseSpeed + 20);
    // Viewers get the mount sprite, not the entitlement id.
    expect(alice.player.toState().mountLookType).toBe(372);
  });
});
