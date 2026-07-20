import { describe, expect, it } from "vitest";
import {
  WHEEL_LIMITS,
  type ServerMessage,
  type WheelSaveMessage,
} from "@tibia/protocol";
import type { Character } from "../character/Character";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import { deriveCharacterStats } from "../progression/deriveCharacterStats";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { PROGRESSION_DEFINITION_VERSION } from "../progression/progressionDefinitionVersion";
import type { Session } from "../Session";
import { makeCharacter } from "../test/makeCharacter";
import { World } from "../World";
import { MemoryWheelStore } from "./MemoryWheelStore";
import { WheelService } from "./WheelService";
import { WheelTracker } from "./WheelTracker";

const A = "00000000-0000-4000-8000-00000000000a";
const PREMIUM_UNTIL = new Date("2030-01-01T00:00:00.000Z");

const emptySlices = (): number[] =>
  new Array<number>(WHEEL_LIMITS.sliceCount).fill(0);

const withSlices = (points: Readonly<Record<number, number>>): number[] => {
  const slices = emptySlices();
  for (const [id, value] of Object.entries(points)) {
    slices[Number(id) - 1] = value;
  }
  return slices;
};

function makeLeveledCharacter(id: string, level: number): Character {
  const base = makeCharacter(id, "Alice");
  const stats = deriveCharacterStats({
    vocation: base.vocation,
    definitionVersion: PROGRESSION_DEFINITION_VERSION,
    level,
  });
  return {
    ...base,
    level,
    experience: BigInt(getExperienceForLevel(level)),
    health: stats.maxHealth,
    mana: stats.maxMana,
  };
}

interface Harness {
  readonly player: Player;
  readonly service: WheelService;
  readonly tracker: WheelTracker;
  readonly store: MemoryWheelStore;
  readonly session: Session;
  readonly sent: ServerMessage[];
}

function makeHarness(options?: {
  level?: number;
  premium?: boolean;
}): Harness {
  const world = new World(
    gridMapData({
      name: "wheel-test",
      width: 60,
      height: 60,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const character = makeLeveledCharacter(A, options?.level ?? 100);
  const player = new Player(
    character,
    { x: 30, y: 30, z: 7 },
    0,
    options?.premium === false ? null : PREMIUM_UNTIL,
  );
  world.addPlayer(player);
  const sent: ServerMessage[] = [];
  const session = {
    id: "session-a",
    playerId: A,
    send: (message: ServerMessage) => sent.push(message),
    sendError: (code: string) =>
      sent.push({ type: "error", code } as ServerMessage),
  } as unknown as Session;
  const store = new MemoryWheelStore();
  const tracker = new WheelTracker(store);
  tracker.attach(A, emptySlices());
  const persistence = {
    saveNow: () => undefined,
  } as unknown as CharacterPersistence;
  const service = new WheelService(world, tracker, persistence);
  return { player, service, tracker, store, session, sent };
}

function save(
  harness: Harness,
  slices: number[],
  now: number,
  requestId = "11111111-1111-4111-8111-111111111111",
): void {
  const intent: WheelSaveMessage = { type: "wheel-save", requestId, slices };
  harness.service.handleSave(harness.session, intent, now);
}

describe("WheelService", () => {
  it("serves the current state with the level-derived point budget", () => {
    const harness = makeHarness({ level: 100 });
    harness.service.handleGet(harness.session, 0);
    expect(harness.sent[0]).toMatchObject({
      type: "wheel-state",
      totalPoints: 50,
      unlocked: true,
      slices: emptySlices(),
    });
  });

  it("applies dedication stats and persists a valid save", async () => {
    const harness = makeHarness({ level: 100 });
    const baseMaxHealth = harness.player.maxHealth;
    // Slice 22 is a health root: 50 points x 3 HP for a knight.
    save(harness, withSlices({ 22: 50 }), 0);
    expect(harness.player.maxHealth).toBe(baseMaxHealth + 150);
    expect(harness.sent.map((m) => m.type)).toEqual([
      "wheel-state",
      "progression-updated",
    ]);
    await harness.tracker.stop();
    expect(await harness.store.loadSlices(A)).toEqual(withSlices({ 22: 50 }));
  });

  it("rejects allocations beyond the earned points at execution time", () => {
    const harness = makeHarness({ level: 100 });
    // 50 earned points cannot fill two roots.
    save(harness, withSlices({ 22: 50, 15: 50 }), 0);
    expect(harness.sent[0]).toMatchObject({
      type: "wheel-action-failed",
      reason: "invalid-allocation",
    });
    expect(harness.tracker.slicesFor(A)).toEqual(emptySlices());
  });

  it("rejects saves from free accounts and low levels", () => {
    const free = makeHarness({ level: 100, premium: false });
    save(free, withSlices({ 22: 50 }), 0);
    expect(free.sent[0]).toMatchObject({
      type: "wheel-action-failed",
      reason: "unavailable",
    });
    const low = makeHarness({ level: 50 });
    save(low, withSlices({ 22: 50 }), 0);
    expect(low.sent[0]).toMatchObject({
      type: "wheel-action-failed",
      reason: "unavailable",
    });
  });

  it("answers a replayed requestId with the state instead of re-applying", () => {
    const harness = makeHarness({ level: 100 });
    save(harness, withSlices({ 22: 50 }), 0);
    harness.sent.length = 0;
    save(
      harness,
      withSlices({ 15: 50 }),
      WHEEL_LIMITS.actionCooldownMs,
    );
    expect(harness.sent[0]?.type).toBe("wheel-state");
    // The replayed intent's differing payload must not be applied.
    expect(harness.tracker.slicesFor(A)).toEqual(withSlices({ 22: 50 }));
  });

  it("rate-limits saves inside the cooldown window", () => {
    const harness = makeHarness({ level: 100 });
    save(harness, withSlices({ 22: 50 }), 0);
    harness.sent.length = 0;
    save(
      harness,
      withSlices({ 22: 50 }),
      WHEEL_LIMITS.actionCooldownMs - 1,
      "22222222-2222-4222-8222-222222222222",
    );
    expect(harness.sent[0]).toMatchObject({
      type: "wheel-action-failed",
      reason: "rate-limited",
    });
  });

  it("clamps current health when a re-save lowers the wheel maximum", () => {
    const harness = makeHarness({ level: 100 });
    save(harness, withSlices({ 22: 50 }), 0);
    harness.player.setHealth(harness.player.maxHealth);
    const boostedHealth = harness.player.health;
    save(
      harness,
      emptySlices(),
      WHEEL_LIMITS.actionCooldownMs,
      "33333333-3333-4333-8333-333333333333",
    );
    expect(harness.player.maxHealth).toBe(boostedHealth - 150);
    expect(harness.player.health).toBe(harness.player.maxHealth);
  });

  it("requires a joined session", () => {
    const harness = makeHarness({ level: 100 });
    const session = {
      id: "session-b",
      playerId: null,
      send: (message: ServerMessage) => harness.sent.push(message),
      sendError: (code: string) =>
        harness.sent.push({ type: "error", code } as ServerMessage),
    } as unknown as Session;
    harness.service.handleGet(session, 0);
    expect(harness.sent[0]).toMatchObject({
      type: "error",
      code: "join-required",
    });
  });
});
