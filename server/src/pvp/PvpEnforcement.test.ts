import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_AUTO_POTION_SETTINGS,
  type ServerMessage,
} from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { Combat } from "../combat/Combat";
import { CombatFeedback } from "../combat/CombatFeedback";
import { CombatFormula } from "../combat/CombatFormula";
import { DamageResolver } from "../combat/DamageResolver";
import { DeathHandler } from "../combat/DeathHandler";
import { EventSequence } from "../combat/EventSequence";
import { gridMapData } from "../gridMapData";
import type { ItemCatalog } from "../item/ItemCatalog";
import { ItemIntentHandler } from "../item/ItemIntentHandler";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { MemoryItemStore } from "../item/MemoryItemStore";
import { Player } from "../Player";
import { deriveCharacterStats } from "../progression/deriveCharacterStats";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { ProgressionSystem } from "../progression/ProgressionSystem";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { PVP_POLICY } from "./PvpPolicy";
import { PvpTracker } from "./PvpTracker";

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function makePlayer(
  id: string,
  level: number,
  position: { x: number; y: number; z: number },
): Player {
  const character = makeCharacter(id, `Player ${id}`);
  const stats = deriveCharacterStats({
    vocation: character.vocation,
    definitionVersion: character.progressionDefinitionVersion,
    level,
  });
  return new Player(
    {
      ...character,
      level,
      experience: BigInt(getExperienceForLevel(level)),
      health: stats.maxHealth,
      mana: stats.maxMana,
    },
    position,
    0,
  );
}

function makeSession(player: Player, sent: ServerMessage[]): Session {
  return {
    id: `session:${player.id}`,
    playerId: player.id,
    viewRange: { x: 8, y: 6 },
    knownCreatureIds: new Set([player.id]),
    knownMapItemTiles: new Map(),
    attackTargetId: null,
    fightMode: { attack: "balanced", chase: false, secure: true },
    combatCooldowns: new Map(),
    autoPotionSettings: { ...DEFAULT_AUTO_POTION_SETTINGS },
    autoPotionSettingsUpdatePending: false,
    itemOperationPending: false,
    movementDirection: null,
    bufferedMovementDirection: null,
    send: (message: ServerMessage) => sent.push(message),
    sendError: (code: string) =>
      sent.push({ type: "error", code } as ServerMessage),
  } as unknown as Session;
}

interface Harness {
  world: World;
  combat: Combat;
  damage: DamageResolver;
  tracker: PvpTracker;
  attacker: Player;
  target: Player;
  attackerSession: Session;
  targetSession: Session;
  sent: ServerMessage[];
}

async function makeHarness(options: {
  attackerLevel?: number;
  targetLevel?: number;
  noPvpZone?: boolean;
} = {}): Promise<Harness> {
  const base = gridMapData({
    name: "pvp-enforce",
    width: 12,
    height: 12,
    blocked: [],
  });
  const world = new World(
    options.noPvpZone
      ? {
          ...base,
          getTile(position) {
            const tile = base.getTile(position);
            return tile ? { ...tile, noPvpZone: true } : undefined;
          },
        }
      : base,
    25,
  );
  const attacker = makePlayer(
    "00000000-0000-4000-8000-0000000000a1",
    options.attackerLevel ?? 8,
    { x: 1, y: 1, z: 7 },
  );
  const target = makePlayer(
    "00000000-0000-4000-8000-0000000000b2",
    options.targetLevel ?? 8,
    { x: 2, y: 1, z: 7 },
  );
  world.addPlayer(attacker);
  world.addPlayer(target);
  const sent: ServerMessage[] = [];
  const attackerSession = makeSession(attacker, sent);
  const targetSession = makeSession(target, sent);
  attackerSession.knownCreatureIds.add(target.id);
  targetSession.knownCreatureIds.add(attacker.id);
  const sessions = new Map([
    [attacker.id, attackerSession],
    [target.id, targetSession],
  ]);
  const registry = {
    all: () => [...sessions.values()],
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registry);
  const persistence = {
    markDirty: vi.fn(),
    saveNow: vi.fn(),
  } as unknown as CharacterPersistence;
  const store = new MemoryItemStore();
  const items = new ItemIntentHandler(store, catalog, world, visibility);
  items.attach(await items.load(attacker.id, attacker.capacity));
  items.attach(await items.load(target.id, target.capacity));
  const progression = new ProgressionSystem(world, registry, persistence, items);
  const tracker = new PvpTracker(
    PVP_POLICY,
    world,
    registry,
    visibility,
    persistence,
    {
      sameParty: () => false,
      sameGuild: () => false,
      atWar: () => false,
    },
  );
  tracker.attach(attacker, [], 0);
  tracker.attach(target, [], 0);
  visibility.setCreatureStateDecorator((viewer, creature, state) =>
    tracker.decorateCreatureState(viewer, creature, state),
  );
  const combat = new Combat(
    world,
    visibility,
    registry,
    persistence,
    progression,
    items,
    12345,
    () => false,
    undefined,
    undefined,
    undefined,
    tracker,
  );
  const formula = new CombatFormula(12345);
  const sequence = new EventSequence();
  const feedback = new CombatFeedback(world, registry);
  const death = new DeathHandler(
    world,
    visibility,
    registry,
    progression,
    items,
    formula,
    feedback,
    () => false,
    undefined,
    undefined,
    tracker,
  );
  const damage = new DamageResolver(
    world,
    visibility,
    registry,
    progression,
    items,
    formula,
    feedback,
    sequence,
    death,
    undefined,
    tracker,
  );
  return {
    world,
    combat,
    damage,
    tracker,
    attacker,
    target,
    attackerSession,
    targetSession,
    sent,
  };
}

describe("PVP enforcement at combat execution", () => {
  it("rejects crafted attack intents against below-protection-level players server-side", async () => {
    const harness = await makeHarness({ targetLevel: 5 });
    harness.attackerSession.fightMode.secure = false;

    harness.combat.selectTarget(harness.attackerSession, harness.target.id, 1_000);
    expect(harness.attackerSession.attackTargetId).toBeNull();
  });

  it("rejects attack intents from a below-protection-level attacker server-side", async () => {
    const harness = await makeHarness({ attackerLevel: 5 });
    harness.attackerSession.fightMode.secure = false;

    harness.combat.selectTarget(harness.attackerSession, harness.target.id, 1_000);
    expect(harness.attackerSession.attackTargetId).toBeNull();
  });

  it("enforces secure mode server-side against unmarked players and lifts it for marked ones", async () => {
    const harness = await makeHarness();

    // Secure mode on: the crafted intent against an unmarked player is
    // refused regardless of what the client UI displayed.
    harness.combat.selectTarget(harness.attackerSession, harness.target.id, 1_000);
    expect(harness.attackerSession.attackTargetId).toBeNull();

    // The target aggresses first (yellow-to-me): secure mode now allows it.
    harness.tracker.onPlayerAttack(harness.target, harness.attacker, 1_500);
    harness.combat.selectTarget(harness.attackerSession, harness.target.id, 2_000);
    expect(harness.attackerSession.attackTargetId).toBe(harness.target.id);
  });

  it("drops a black-skulled attacker's damage against an unmarked player", async () => {
    const harness = await makeHarness();
    harness.attacker.skull = "black";
    harness.attacker.skullExpiresAt = 1_000_000;
    const healthBefore = harness.target.health;

    const result = harness.damage.applyDamage(
      harness.target,
      {
        sourceId: harness.attacker.id,
        origin: "melee",
        type: "physical",
        minimum: 10,
        maximum: 10,
      },
      1_000,
    );

    expect(result.amount).toBe(0);
    expect(result.block).toBe("immunity");
    expect(harness.target.health).toBe(healthBefore);
    // No aggression was recorded either: the target shows no yellow mark.
    const state = harness.tracker.decorateCreatureState(
      harness.target,
      harness.attacker,
      harness.attacker.toState(),
    );
    expect(state.skull).toBe("black");
  });

  it("re-checks a black skull acquired after targeting on every attack tick", async () => {
    const harness = await makeHarness();
    harness.attackerSession.fightMode.secure = false;
    harness.combat.selectTarget(harness.attackerSession, harness.target.id, 1_000);
    expect(harness.attackerSession.attackTargetId).toBe(harness.target.id);

    // The attacker turns black-skulled while the (stale) target remains
    // selected; the auto-attack tick re-validates and drops the target.
    harness.attacker.skull = "black";
    harness.attacker.skullExpiresAt = 1_000_000;
    const healthBefore = harness.target.health;
    harness.combat.tick(2_000);

    expect(harness.attackerSession.attackTargetId).toBeNull();
    expect(harness.target.health).toBe(healthBefore);
  });

  it("blocks player attacks inside no-pvp zones at execution time", async () => {
    const harness = await makeHarness({ noPvpZone: true });
    harness.attackerSession.fightMode.secure = false;

    harness.combat.selectTarget(harness.attackerSession, harness.target.id, 1_000);
    expect(harness.attackerSession.attackTargetId).toBeNull();

    // Even a retaliation mark cannot bypass the zone refusal.
    harness.tracker.onPlayerAttack(harness.target, harness.attacker, 1_500);
    expect(
      harness.tracker.canTarget(
        harness.attackerSession,
        harness.attacker,
        harness.target,
      ),
    ).toBe(false);
  });
});
