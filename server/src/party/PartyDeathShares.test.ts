import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { CombatFeedback } from "../combat/CombatFeedback";
import { CombatFormula } from "../combat/CombatFormula";
import { DeathHandler } from "../combat/DeathHandler";
import { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import { gridMapData } from "../gridMapData";
import type { ItemCatalog } from "../item/ItemCatalog";
import { ItemIntentHandler } from "../item/ItemIntentHandler";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { MemoryItemStore } from "../item/MemoryItemStore";
import { Player } from "../Player";
import { ProgressionSystem } from "../progression/ProgressionSystem";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { PartyHandler } from "./PartyHandler";

const A = "00000000-0000-4000-8000-00000000001a";
const B = "00000000-0000-4000-8000-00000000001b";

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function makeMonsterType(experience: number): MonsterType {
  return {
    id: "rat",
    name: "Rat",
    description: "a rat",
    outfit: { lookType: 21, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
    health: 20,
    maxHealth: 20,
    speed: 67,
    manaCost: 0,
    changeTarget: { intervalMs: 4_000, chance: 0 },
    light: { intensity: 0, color: 0 },
    experience,
    corpseItemTypeId: 5964,
    flags: {
      attackable: true,
      hostile: true,
      pushable: true,
      summonable: true,
      convinceable: false,
      illusionable: false,
      canPushItems: false,
      canPushCreatures: false,
      targetDistance: 1,
      runHealth: 0,
      staticAttackChance: 95,
      healthHidden: false,
    },
    targetStrategy: { nearest: 100, health: 0, damage: 0, random: 0 },
    attacks: [],
    defenses: [],
    elements: {},
  immunities: [],
  maxSummons: 0,
  summons: [],
    voices: [],
    loot: [],
  };
}

interface Harness {
  readonly world: World;
  readonly parties: PartyHandler;
  readonly progression: ProgressionSystem;
  readonly death: DeathHandler;
  readonly players: Map<string, Player>;
  readonly sentByPlayer: Map<string, ServerMessage[]>;
}

function makeHarness(experienceRate = 1): Harness {
  const world = new World(
    gridMapData({
      name: "party-death-test",
      width: 20,
      height: 20,
      blocked: [],
      floors: [7],
    }),
    25,
  );
  const players = new Map<string, Player>();
  const sentByPlayer = new Map<string, ServerMessage[]>();
  const sessions = new Map<string, Session>();
  for (const [id, name, x] of [
    [A, "Alice", 5],
    [B, "Bob", 6],
  ] as const) {
    const player = new Player(makeCharacter(id, name), { x, y: 5, z: 7 }, 0);
    world.addPlayer(player);
    players.set(id, player);
    const sent: ServerMessage[] = [];
    sentByPlayer.set(id, sent);
    sessions.set(id, {
      id: `session-${id}`,
      playerId: id,
      viewRange: { x: 8, y: 6 },
      knownCreatureIds: new Set([id]),
      knownMapItemTiles: new Map(),
      attackTargetId: null,
      send: (message: ServerMessage) => sent.push(message),
      sendError: () => {},
    } as unknown as Session);
  }
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registry);
  const store = new MemoryItemStore();
  const items = new ItemIntentHandler(store, catalog, world, visibility);
  const persistence = {
    markDirty: vi.fn(),
    saveNow: vi.fn(),
    isExternalMutationPending: vi.fn(() => false),
  } as unknown as CharacterPersistence;
  const progression = new ProgressionSystem(
    world,
    registry,
    persistence,
    items,
  );
  const parties = new PartyHandler(world, registry, visibility);
  const formula = new CombatFormula(12345);
  const feedback = new CombatFeedback(world, registry);
  const death = new DeathHandler(
    world,
    visibility,
    registry,
    progression,
    items,
    formula,
    feedback,
    () => true,
    parties,
    undefined,
    undefined,
    experienceRate,
  );
  return { world, parties, progression, death, players, sentByPlayer };
}

function formParty(harness: Harness, now: number): void {
  const sessionOf = (playerId: string) =>
    ({
      id: `session-${playerId}`,
      playerId,
      send: (message: ServerMessage) =>
        harness.sentByPlayer.get(playerId)?.push(message),
      sendError: () => {},
    }) as unknown as Session;
  harness.parties.handle(
    sessionOf(A),
    { type: "party-invite", targetName: "Bob" },
    now,
  );
  harness.parties.handle(
    sessionOf(B),
    { type: "party-respond-invite", leaderId: A, accept: true },
    now + 600,
  );
}

function makeDeadMonster(experience: number): Monster {
  const monster = new Monster({
    id: "monster-1",
    type: makeMonsterType(experience),
    position: { x: 5, y: 6, z: 7 },
    direction: "south",
    home: { x: 5, y: 6, z: 7 },
    spawnRadius: 8,
  });
  monster.setHealth(0);
  return monster;
}

describe("party experience shares at death resolution", () => {
  it("splits experience across eligible members and never double-awards", () => {
    const harness = makeHarness();
    const now = 1_000_000;
    formParty(harness, now);
    const monster = makeDeadMonster(100);
    harness.world.addCreature(monster);

    harness.death.handleDeath(monster, A, now + 1_000);
    // Two knights: V = 1 → multiplier 1.2 → ceil(100 · 1.2 / 2) = 60 each.
    expect(harness.players.get(A)?.experience).toBe(60);
    expect(harness.players.get(B)?.experience).toBe(60);

    // Replaying the same death is a no-op: claimDeath already consumed it.
    harness.death.handleDeath(monster, A, now + 1_001);
    expect(harness.players.get(A)?.experience).toBe(60);
    expect(harness.players.get(B)?.experience).toBe(60);
  });

  it("applies the global experience rate before splitting the party award", () => {
    const harness = makeHarness(2);
    const now = 1_000_000;
    formParty(harness, now);
    const monster = makeDeadMonster(100);
    harness.world.addCreature(monster);

    harness.death.handleDeath(monster, A, now + 1_000);

    // 100 base · 2 global · 1.2 party bonus / 2 members = 120 each.
    expect(harness.players.get(A)?.experience).toBe(120);
    expect(harness.players.get(B)?.experience).toBe(120);
    // The synchronous corpse broadcast (tile-states) may follow the award.
    expect(harness.sentByPlayer.get(A)).toContainEqual(
      expect.objectContaining({
        type: "combat-log",
        kind: "experience",
        text: "You gained 120 experience (party share).",
      }),
    );
  });

  it("floors fractional global experience awards to whole points", () => {
    const harness = makeHarness(1.5);
    const monster = makeDeadMonster(5);
    harness.world.addCreature(monster);

    harness.death.handleDeath(monster, A, 1_000_000);

    expect(harness.players.get(A)?.experience).toBe(7);
    expect(harness.sentByPlayer.get(A)).toContainEqual(
      expect.objectContaining({
        type: "combat-log",
        kind: "experience",
        text: "You gained 7 experience.",
      }),
    );
  });

  it("allows a zero rate to disable monster experience awards", () => {
    const harness = makeHarness(0);
    const monster = makeDeadMonster(100);
    harness.world.addCreature(monster);

    harness.death.handleDeath(monster, A, 1_000_000);
    expect(harness.players.get(A)?.experience).toBe(0);
    expect(harness.sentByPlayer.get(A) ?? []).not.toContainEqual(
      expect.objectContaining({ type: "combat-log", kind: "experience" }),
    );
  });

  it("is idempotent per member for a replayed award event id", () => {
    const harness = makeHarness();
    const now = 1_000_000;
    const eventId = "death:replayed-event";
    expect(
      harness.progression.awardExperience(A, eventId, 60, now),
    ).toBe(true);
    expect(
      harness.progression.awardExperience(A, eventId, 60, now),
    ).toBe(false);
    expect(harness.players.get(A)?.experience).toBe(60);
  });

  it("awards killer-only when the member left before death resolution", () => {
    const harness = makeHarness();
    const now = 1_000_000;
    formParty(harness, now);
    // Bob contributed damage but leaves before the kill resolves.
    harness.parties.recordMonsterDamage(B, now + 100);
    harness.parties.detachCharacter(B, now + 200);
    const monster = makeDeadMonster(100);
    harness.world.addCreature(monster);

    harness.death.handleDeath(monster, A, now + 1_000);
    expect(harness.players.get(A)?.experience).toBe(100);
    expect(harness.players.get(B)?.experience).toBe(0);
  });

  it("awards killer-only when shared experience is off at execution time", () => {
    const harness = makeHarness();
    const now = 1_000_000;
    formParty(harness, now);
    const sessionA = {
      id: `session-${A}`,
      playerId: A,
      send: () => {},
      sendError: () => {},
    } as unknown as Session;
    harness.parties.handle(
      sessionA,
      { type: "party-set-shared-exp", enabled: false },
      now + 1_200,
    );
    const monster = makeDeadMonster(100);
    harness.world.addCreature(monster);

    harness.death.handleDeath(monster, A, now + 2_000);
    expect(harness.players.get(A)?.experience).toBe(100);
    expect(harness.players.get(B)?.experience).toBe(0);
  });
});
