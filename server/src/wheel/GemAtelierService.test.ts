import { describe, expect, it } from "vitest";
import {
  GEM_ATELIER_LIMITS,
  WHEEL_LIMITS,
  type GemAction,
  type GemStateMessage,
  type ServerMessage,
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
import { GemAtelierService } from "./GemAtelierService";
import { GemTracker } from "./GemTracker";
import { MemoryGemStore } from "./MemoryGemStore";
import { WheelTracker } from "./WheelTracker";

const A = "00000000-0000-4000-8000-00000000000a";
const PREMIUM_UNTIL = new Date("2030-01-01T00:00:00.000Z");

const emptySlices = (): number[] =>
  new Array<number>(WHEEL_LIMITS.sliceCount).fill(0);

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
  readonly service: GemAtelierService;
  readonly tracker: GemTracker;
  readonly wheelTracker: WheelTracker;
  readonly store: MemoryGemStore;
  readonly session: Session;
  readonly sent: ServerMessage[];
}

async function makeHarness(options?: {
  premium?: boolean;
  gold?: number;
  resources?: Partial<Record<string, number>>;
  slices?: number[];
  rng?: ReadonlyArray<number>;
}): Promise<Harness> {
  const world = new World(
    gridMapData({
      name: "gem-test",
      width: 60,
      height: 60,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const character = makeLeveledCharacter(A, 100);
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
  const store = new MemoryGemStore();
  store.setBankBalance(A, options?.gold ?? 0);
  if (options?.resources) store.seedResources(A, options.resources);
  const tracker = new GemTracker(store);
  tracker.attach(A, await store.load(A));
  const wheelTracker = new WheelTracker();
  wheelTracker.attach(A, options?.slices ?? emptySlices());
  const persistence = {
    saveNow: () => undefined,
  } as unknown as CharacterPersistence;
  const rolls = [...(options?.rng ?? [])];
  const service = new GemAtelierService(
    world,
    tracker,
    wheelTracker,
    persistence,
    store,
    () => rolls.shift() ?? 0,
  );
  return { player, service, tracker, wheelTracker, store, session, sent };
}

let requestCounter = 0;
const nextRequestId = (): string =>
  `00000000-0000-4000-8000-1000000${String(requestCounter++).padStart(5, "0")}`;

function act(harness: Harness, action: GemAction, now: number): void {
  harness.service.handleAction(
    harness.session,
    { type: "wheel-gem-action", requestId: nextRequestId(), action },
    now,
  );
}

async function settle(harness: Harness, now: number): Promise<void> {
  await harness.service.stop();
  harness.service.applyResolvedOutcomes(now);
}

function lastGemState(harness: Harness): GemStateMessage {
  const states = harness.sent.filter(
    (message): message is GemStateMessage =>
      message.type === "wheel-gems-state",
  );
  const last = states[states.length - 1];
  if (!last) throw new Error("no wheel-gems-state was sent");
  return last;
}

/** rng [domain, slot1 pick]: green domain, basic mod 31 (+300 HP knight). */
const HEALTH_MOD_RNG = [0, 0.25];

describe("GemAtelierService", () => {
  it("reveals a gem: charges bank gold, consumes the unrevealed gem", async () => {
    const harness = await makeHarness({
      gold: 200_000,
      resources: { lesserGems: 2 },
      rng: HEALTH_MOD_RNG,
    });
    act(harness, { kind: "reveal", quality: "lesser" }, 0);
    await settle(harness, 0);
    const state = lastGemState(harness);
    expect(state.resources.lesserGems).toBe(1);
    expect(state.resources.gold).toBe(75_000);
    expect(state.revealed).toHaveLength(1);
    expect(state.revealed[0]).toMatchObject({
      domain: "green",
      quality: "lesser",
      locked: false,
      basicModIds: [31],
    });
  });

  it("rejects a reveal the bank cannot cover, changing nothing", async () => {
    const harness = await makeHarness({
      gold: 124_999,
      resources: { lesserGems: 1 },
    });
    act(harness, { kind: "reveal", quality: "lesser" }, 0);
    await settle(harness, 0);
    expect(harness.sent[0]).toMatchObject({
      type: "wheel-gem-failed",
      reason: "insufficient-gold",
    });
    expect(harness.tracker.dataFor(A).resources.lesserGems).toBe(1);
    expect(await harness.store.bankBalance(A)).toBe(124_999);
  });

  it("rejects a reveal without an unrevealed gem before touching gold", async () => {
    const harness = await makeHarness({ gold: 1_000_000 });
    act(harness, { kind: "reveal", quality: "lesser" }, 0);
    expect(harness.sent[0]).toMatchObject({
      type: "wheel-gem-failed",
      reason: "insufficient-gems",
    });
    expect(await harness.store.bankBalance(A)).toBe(1_000_000);
  });

  it("answers a replayed requestId with state instead of re-charging", async () => {
    const harness = await makeHarness({
      gold: 250_000,
      resources: { lesserGems: 2 },
      rng: [...HEALTH_MOD_RNG, ...HEALTH_MOD_RNG],
    });
    const requestId = "00000000-0000-4000-8000-999999999999";
    const intent = {
      type: "wheel-gem-action" as const,
      requestId,
      action: { kind: "reveal", quality: "lesser" } as GemAction,
    };
    harness.service.handleAction(harness.session, intent, 0);
    await settle(harness, 0);
    harness.service.handleAction(
      harness.session,
      intent,
      GEM_ATELIER_LIMITS.actionCooldownMs,
    );
    await settle(harness, GEM_ATELIER_LIMITS.actionCooldownMs);
    const state = lastGemState(harness);
    expect(state.revealed).toHaveLength(1);
    expect(state.resources.gold).toBe(125_000);
  });

  it("rate-limits gem actions inside the cooldown window", async () => {
    const harness = await makeHarness({
      gold: 1_000_000,
      resources: { lesserGems: 5 },
      rng: [...HEALTH_MOD_RNG, ...HEALTH_MOD_RNG],
    });
    act(harness, { kind: "reveal", quality: "lesser" }, 0);
    act(
      harness,
      { kind: "reveal", quality: "lesser" },
      GEM_ATELIER_LIMITS.actionCooldownMs - 1,
    );
    await settle(harness, GEM_ATELIER_LIMITS.actionCooldownMs - 1);
    expect(
      harness.sent.filter(
        (message) =>
          message.type === "wheel-gem-failed" &&
          message.reason === "rate-limited",
      ),
    ).toHaveLength(1);
    expect(harness.tracker.dataFor(A).revealed).toHaveLength(1);
  });

  it("destroys an unlocked, unequipped gem into fragments", async () => {
    const harness = await makeHarness({
      gold: 200_000,
      resources: { lesserGems: 1 },
      // domain, slot1 pick, destroy fragment roll (0 -> minimum yield).
      rng: [...HEALTH_MOD_RNG, 0],
    });
    act(harness, { kind: "reveal", quality: "lesser" }, 0);
    await settle(harness, 0);
    const gemId = lastGemState(harness).revealed[0]?.id ?? "";
    act(
      harness,
      { kind: "destroy", gemId },
      GEM_ATELIER_LIMITS.actionCooldownMs,
    );
    await settle(harness, GEM_ATELIER_LIMITS.actionCooldownMs);
    const state = lastGemState(harness);
    expect(state.revealed).toHaveLength(0);
    expect(state.resources.lesserFragments).toBe(1);
  });

  it("refuses to destroy or switch a locked gem", async () => {
    const harness = await makeHarness({
      gold: 1_000_000,
      resources: { lesserGems: 1 },
      rng: HEALTH_MOD_RNG,
    });
    act(harness, { kind: "reveal", quality: "lesser" }, 0);
    await settle(harness, 0);
    const gemId = lastGemState(harness).revealed[0]?.id ?? "";
    act(
      harness,
      { kind: "toggle-lock", gemId },
      GEM_ATELIER_LIMITS.actionCooldownMs,
    );
    act(
      harness,
      { kind: "destroy", gemId },
      GEM_ATELIER_LIMITS.actionCooldownMs * 2,
    );
    act(
      harness,
      { kind: "switch-domain", gemId },
      GEM_ATELIER_LIMITS.actionCooldownMs * 3,
    );
    await settle(harness, GEM_ATELIER_LIMITS.actionCooldownMs * 3);
    expect(
      harness.sent
        .filter((message) => message.type === "wheel-gem-failed")
        .map((message) => message.reason),
    ).toEqual(["gem-locked", "gem-locked"]);
  });

  it("grants an equipped gem's mod only once vessel resonance unlocks it", async () => {
    const slices = emptySlices();
    const harnessWithout = await makeHarness({
      gold: 200_000,
      resources: { lesserGems: 1 },
      slices,
      rng: HEALTH_MOD_RNG,
    });
    act(harnessWithout, { kind: "reveal", quality: "lesser" }, 0);
    await settle(harnessWithout, 0);
    const baseHealth = harnessWithout.player.maxHealth;
    const gemId = lastGemState(harnessWithout).revealed[0]?.id ?? "";
    act(
      harnessWithout,
      { kind: "equip", gemId },
      GEM_ATELIER_LIMITS.actionCooldownMs,
    );
    await settle(harnessWithout, GEM_ATELIER_LIMITS.actionCooldownMs);
    // No maxed resonance slice in green: the gem is socketed but inert.
    expect(harnessWithout.player.maxHealth).toBe(baseHealth);

    // Slice 15 is green's ring-1 resonance slice; maxed (50) it unlocks
    // the first mod: +300 hit points for a knight from basic mod 31.
    const resonant = emptySlices();
    resonant[14] = 50;
    const harnessWith = await makeHarness({
      gold: 200_000,
      resources: { lesserGems: 1 },
      slices: resonant,
      rng: HEALTH_MOD_RNG,
    });
    act(harnessWith, { kind: "reveal", quality: "lesser" }, 0);
    await settle(harnessWith, 0);
    const before = harnessWith.player.maxHealth;
    const equipId = lastGemState(harnessWith).revealed[0]?.id ?? "";
    act(
      harnessWith,
      { kind: "equip", gemId: equipId },
      GEM_ATELIER_LIMITS.actionCooldownMs,
    );
    await settle(harnessWith, GEM_ATELIER_LIMITS.actionCooldownMs);
    expect(harnessWith.player.maxHealth).toBe(before + 300);

    // Unequipping takes the bonus away again.
    act(
      harnessWith,
      { kind: "unequip", domain: "green" },
      GEM_ATELIER_LIMITS.actionCooldownMs * 2,
    );
    await settle(harnessWith, GEM_ATELIER_LIMITS.actionCooldownMs * 2);
    expect(harnessWith.player.maxHealth).toBe(before);
  });

  it("improves a mod grade for gold + fragments and scales the bonus", async () => {
    const resonant = emptySlices();
    resonant[14] = 50;
    const harness = await makeHarness({
      gold: 3_000_000,
      resources: { lesserGems: 1, lesserFragments: 5 },
      slices: resonant,
      rng: HEALTH_MOD_RNG,
    });
    act(harness, { kind: "reveal", quality: "lesser" }, 0);
    await settle(harness, 0);
    const gemId = lastGemState(harness).revealed[0]?.id ?? "";
    act(
      harness,
      { kind: "equip", gemId },
      GEM_ATELIER_LIMITS.actionCooldownMs,
    );
    await settle(harness, GEM_ATELIER_LIMITS.actionCooldownMs);
    const before = harness.player.maxHealth;
    act(
      harness,
      { kind: "improve-grade", modKind: "basic", modId: 31 },
      GEM_ATELIER_LIMITS.actionCooldownMs * 2,
    );
    await settle(harness, GEM_ATELIER_LIMITS.actionCooldownMs * 2);
    const state = lastGemState(harness);
    expect(state.grades.basic).toEqual([{ modId: 31, grade: 1 }]);
    expect(state.resources.lesserFragments).toBe(0);
    expect(state.resources.gold).toBe(3_000_000 - 125_000 - 2_000_000);
    // Grade 1 multiplies the +300 HP mod by 1.1.
    expect(harness.player.maxHealth).toBe(before + 30);
  });

  it("rejects a grade improvement without enough fragments", async () => {
    const harness = await makeHarness({
      gold: 10_000_000,
      resources: { lesserFragments: 4 },
    });
    act(harness, { kind: "improve-grade", modKind: "basic", modId: 31 }, 0);
    expect(harness.sent[0]).toMatchObject({
      type: "wheel-gem-failed",
      reason: "insufficient-fragments",
    });
    expect(await harness.store.bankBalance(A)).toBe(10_000_000);
  });

  it("rejects gem actions from free accounts", async () => {
    const harness = await makeHarness({
      premium: false,
      gold: 1_000_000,
      resources: { lesserGems: 1 },
    });
    act(harness, { kind: "reveal", quality: "lesser" }, 0);
    expect(harness.sent[0]).toMatchObject({
      type: "wheel-gem-failed",
      reason: "unavailable",
    });
  });
});
