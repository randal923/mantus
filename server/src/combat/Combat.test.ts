import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  CharacterVocation,
  ServerMessage,
} from "@tibia/protocol";
import type { Character } from "../character/Character";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { Monster } from "../creature/Monster";
import type {
  MonsterAbility,
  MonsterType,
} from "../creature/MonsterType";
import { gridMapData } from "../gridMapData";
import type { Item } from "../item/Item";
import type { ItemCatalog } from "../item/ItemCatalog";
import { ItemIntentHandler } from "../item/ItemIntentHandler";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { MemoryItemStore } from "../item/MemoryItemStore";
import type { MapData } from "../MapData";
import { Player } from "../Player";
import { positionKey } from "../positionKey";
import { ProgressionSystem } from "../progression/ProgressionSystem";
import { deriveCharacterStats } from "../progression/deriveCharacterStats";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { getVocation } from "../progression/getVocation";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { Combat } from "./Combat";

const PLAYER_ID = "00000000-0000-4000-8000-000000000010";
const WEAPON_ID = "00000000-0000-4000-8000-000000000011";
const AMMO_ID = "00000000-0000-4000-8000-000000000012";
const RUNE_ID = "00000000-0000-4000-8000-000000000013";
const BACKPACK_ID = "00000000-0000-4000-8000-000000000014";
const POTION_ID = "00000000-0000-4000-8000-000000000015";
const FRIEND_ID = "00000000-0000-4000-8000-000000000016";

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

interface Harness {
  readonly world: World;
  readonly player: Player;
  readonly session: Session;
  readonly sent: ServerMessage[];
  readonly store: MemoryItemStore;
  readonly items: ItemIntentHandler;
  readonly combat: Combat;
  readonly persistence: CharacterPersistence;
  readonly terminate: ReturnType<typeof vi.fn>;
  readonly deaths: { count: number };
}

function makeMonsterType(
  overrides: Partial<MonsterType> = {},
): MonsterType {
  return {
    id: "rat",
    name: "Rat",
    description: "a rat",
    outfit: {
      lookType: 21,
      head: 0,
      body: 0,
      legs: 0,
      feet: 0,
      addons: 0,
    },
    health: 20,
    maxHealth: 20,
    speed: 67,
    manaCost: 0,
    changeTarget: { intervalMs: 4_000, chance: 0 },
    light: { intensity: 0, color: 0 },
    experience: 5,
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
    ...overrides,
  };
}

function makeMonster(
  id: string,
  position: { x: number; y: number; z: number },
  type = makeMonsterType(),
): Monster {
  return new Monster({
    id,
    type,
    position,
    direction: "south",
    home: position,
    spawnRadius: 8,
  });
}

function makeLeveledCharacter(
  level = 1,
  vocation: CharacterVocation = "Knight",
  magicLevel = 0,
): Character {
  const character = makeCharacter(PLAYER_ID, "Fighter");
  const stats = deriveCharacterStats({
    vocation,
    definitionVersion: character.progressionDefinitionVersion,
    level,
  });
  return {
    ...character,
    vocation,
    level,
    experience: BigInt(getExperienceForLevel(level)),
    magicLevel,
    health: stats.maxHealth,
    mana: stats.maxMana,
    soul: getVocation(vocation).maxSoul,
  };
}

function makeMap(
  blocked: ReadonlyArray<readonly [number, number]> = [],
  protectionZones: ReadonlyArray<{ x: number; y: number; z: number }> = [],
  noPvpZones: ReadonlyArray<{ x: number; y: number; z: number }> = [],
  floors: ReadonlyArray<number> = [7],
): MapData {
  const base = gridMapData({
    name: "combat-test",
    width: 12,
    height: 12,
    blocked,
    floors,
  });
  const protection = new Set(protectionZones.map(positionKey));
  const noPvp = new Set(noPvpZones.map(positionKey));
  return {
    ...base,
    getTile(position) {
      const tile = base.getTile(position);
      return tile
        ? {
            ...tile,
            protectionZone: protection.has(positionKey(position)),
            noPvpZone: noPvp.has(positionKey(position)),
          }
        : undefined;
    },
  };
}

function ownedItem(
  id: string,
  typeId: number,
  location: Item["location"],
  count = 1,
): Item {
  return {
    id,
    typeId,
    count,
    attributes: {},
    version: 1,
    location,
  };
}

async function makeHarness(options: {
  character?: Character;
  position?: { x: number; y: number; z: number };
  map?: MapData;
  inventory?: ReadonlyArray<Item>;
} = {}): Promise<Harness> {
  const world = new World(
    options.map ?? makeMap(),
    25,
  );
  const player = new Player(
    options.character ?? makeLeveledCharacter(),
    options.position ?? { x: 1, y: 1, z: 7 },
    0,
  );
  world.addPlayer(player);
  const sent: ServerMessage[] = [];
  const terminate = vi.fn();
  const session = {
    id: "session",
    playerId: player.id,
    viewRange: { x: 8, y: 6 },
    knownCreatureIds: new Set([player.id]),
    knownMapItemTiles: new Map(),
    attackTargetId: null,
    fightMode: { attack: "balanced", chase: true, secure: true },
    combatCooldowns: new Map(),
    itemOperationPending: false,
    potionPersistPending: false,
    itemPersistsPending: 0,
    movementDirection: null,
    bufferedMovementDirection: null,
    send: (message: ServerMessage) => sent.push(message),
    sendError: (code: "combat-action-failed") =>
      sent.push({ type: "error", code }),
    terminate,
  } as unknown as Session;
  const registry = {
    all: () => [session],
    sessionFor: (playerId: string) =>
      playerId === player.id ? session : undefined,
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registry);
  const store = new MemoryItemStore();
  for (const item of options.inventory ?? []) store.seed(item);
  const items = new ItemIntentHandler(store, catalog, world, visibility);
  items.attach(await items.load(player.id, player.capacity));
  const persistence = {
    markDirty: vi.fn(),
    saveNow: vi.fn(),
    beginExternalMutation: vi.fn(async () => player.version),
    completeExternalMutation: vi.fn(),
    cancelExternalMutation: vi.fn(),
    failExternalMutation: vi.fn(),
    isExternalMutationPending: vi.fn(() => false),
  } as unknown as CharacterPersistence;
  const progression = new ProgressionSystem(
    world,
    registry,
    persistence,
    items,
  );
  const deaths = { count: 0 };
  const combat = new Combat(
    world,
    visibility,
    registry,
    persistence,
    progression,
    items,
    12345,
    (monster) => {
      deaths.count++;
      const removed = world.removeCreature(monster.id);
      if (removed) visibility.announceCreatureLeave(removed);
      return true;
    },
  );
  return {
    world,
    player,
    session,
    sent,
    store,
    items,
    combat,
    persistence,
    terminate,
    deaths,
  };
}

async function settleItems(harness: Harness, now: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  harness.items.applyResolvedOutcomes(now);
}

describe("Combat", () => {
  it("preserves the valid target when forged, hidden, wrong-floor, or unattackable ids arrive", async () => {
    const harness = await makeHarness({
      map: makeMap([], [], [], [7, 8]),
    });
    const valid = makeMonster(
      "monster-instance:valid:0",
      { x: 2, y: 1, z: 7 },
    );
    const invisible = makeMonster(
      "monster-instance:invisible:0",
      { x: 3, y: 1, z: 7 },
    );
    invisible.conditions.apply(
      { type: "invisible", sourceId: invisible.id, durationMs: 5_000 },
      0,
    );
    const wrongFloor = makeMonster(
      "monster-instance:upper:0",
      { x: 2, y: 1, z: 8 },
    );
    const unattackable = makeMonster(
      "monster-instance:unattackable:0",
      { x: 1, y: 2, z: 7 },
      makeMonsterType({
        flags: {
          ...makeMonsterType().flags,
          attackable: false,
        },
      }),
    );
    for (const monster of [valid, invisible, wrongFloor, unattackable]) {
      harness.world.addCreature(monster);
      harness.session.knownCreatureIds.add(monster.id);
    }
    harness.combat.selectTarget(harness.session, valid.id, 1_000);

    for (const creatureId of [
      "monster-instance:forged:0",
      invisible.id,
      wrongFloor.id,
      unattackable.id,
    ]) {
      harness.combat.selectTarget(harness.session, creatureId, 1_000);
      expect(harness.session.attackTargetId).toBe(valid.id);
    }
  });

  it("kills a creature once, awards experience, and starts audited corpse creation", async () => {
    const harness = await makeHarness({
      inventory: [
        ownedItem(WEAPON_ID, 3273, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
    });
    const monster = makeMonster(
      "monster-instance:rat:0",
      { x: 2, y: 1, z: 7 },
      makeMonsterType({ health: 1, maxHealth: 1 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);

    harness.combat.selectTarget(harness.session, monster.id, 1_000);
    harness.combat.tick(1_000);
    harness.combat.tick(1_000);

    expect(monster.health).toBe(0);
    expect(harness.world.getCreature(monster.id)).toBeUndefined();
    expect(harness.deaths.count).toBe(1);
    expect(harness.player.experience).toBe(5);
    expect(
      harness.sent.filter(
        (message) => message.type === "experience-text",
      ),
    ).toEqual([
      {
        type: "experience-text",
        position: monster.position,
        value: 5,
      },
    ]);
    expect(
      harness.sent.filter(
        (message) =>
          message.type === "combat-log" &&
          message.kind === "experience",
      ),
    ).toHaveLength(1);
  });

  it("enforces spell resources and cooldowns against rapid replay", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(20, "Knight", 3),
    });
    harness.player.setHealth(harness.player.health - 50);
    const manaBefore = harness.player.mana;

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exura-infir-ico",
        target: { kind: "self" },
      },
      1_000,
    );
    const healthAfterFirst = harness.player.health;
    const manaAfterFirst = harness.player.mana;
    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exura-infir-ico",
        target: { kind: "self" },
      },
      1_000,
    );

    expect(healthAfterFirst).toBeGreaterThan(harness.player.maxHealth - 50);
    expect(manaAfterFirst).toBe(manaBefore - 10);
    expect(harness.player.health).toBe(healthAfterFirst);
    expect(harness.player.mana).toBe(manaAfterFirst);
    expect(
      harness.sent.some(
        (message) =>
          message.type === "error" &&
          message.code === "combat-action-failed",
      ),
    ).toBe(true);
    expect(
      harness.session.combatCooldowns.get("group:healing")?.readyAt,
    ).toBe(2_000);
  });

  it("casts the level-one Canary directional spell with its imported area", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(1, "Druid", 0),
    });
    const target = makeMonster(
      "monster-instance:chill-out:0",
      { x: 1, y: 2, z: 7 },
    );
    harness.world.addCreature(target);
    harness.session.knownCreatureIds.add(target.id);
    const manaBefore = harness.player.mana;

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exevo-infir-frigo-hur",
        target: { kind: "direction" },
      },
      1_000,
    );

    expect(target.health).toBeLessThan(target.maxHealth);
    expect(target.health).toBeGreaterThanOrEqual(target.maxHealth - 4);
    expect(harness.player.mana).toBe(manaBefore - 8);
    expect(
      harness.session.combatCooldowns.get(
        "spell:exevo-infir-frigo-hur",
      )?.readyAt,
    ).toBe(5_000);
    expect(
      harness.session.combatCooldowns.get("group:attack")?.readyAt,
    ).toBe(3_000);
  });

  it("applies pinned haste and recovery conditions on the server clock", async () => {
    const hasteHarness = await makeHarness({
      character: makeLeveledCharacter(20, "Knight", 0),
    });
    const baseSpeed = hasteHarness.player.progression.speed;

    hasteHarness.combat.castSpell(
      hasteHarness.session,
      {
        type: "cast-spell",
        spellId: "utani-hur",
        target: { kind: "self" },
      },
      1_000,
    );

    expect(hasteHarness.player.stepSpeed).toBe(
      Math.floor(1.3 * (baseSpeed - 40) + 40),
    );
    expect(
      hasteHarness.player.conditions.remainingMs("haste", 1_000),
    ).toBe(30_000);

    const recoveryHarness = await makeHarness({
      character: makeLeveledCharacter(50, "Knight", 0),
    });
    recoveryHarness.player.setHealth(recoveryHarness.player.health - 100);
    const healthBefore = recoveryHarness.player.health;
    recoveryHarness.combat.castSpell(
      recoveryHarness.session,
      {
        type: "cast-spell",
        spellId: "utura",
        target: { kind: "self" },
      },
      1_000,
    );
    recoveryHarness.combat.tick(4_000);

    expect(recoveryHarness.player.health).toBe(healthBefore + 20);
    expect(
      recoveryHarness.player.conditions.allowsNaturalRegeneration,
    ).toBe(false);
  });

  it("applies and cures pinned damage conditions without client-authored values", async () => {
    const damageHarness = await makeHarness({
      character: makeLeveledCharacter(34, "Sorcerer", 3),
    });
    const target = makeMonster(
      "monster-instance:electrify:0",
      { x: 2, y: 1, z: 7 },
      makeMonsterType({ health: 500, maxHealth: 500 }),
    );
    damageHarness.world.addCreature(target);
    damageHarness.session.knownCreatureIds.add(target.id);

    damageHarness.combat.castSpell(
      damageHarness.session,
      {
        type: "cast-spell",
        spellId: "utori-vis",
        target: { kind: "creature", creatureId: target.id },
      },
      1_000,
    );
    damageHarness.combat.tick(4_000);

    expect(target.health).toBe(455);
    expect(target.conditions.has("energy")).toBe(true);

    const cureHarness = await makeHarness({
      character: makeLeveledCharacter(10, "Knight", 0),
    });
    cureHarness.player.conditions.apply(
      {
        type: "poison",
        sourceId: target.id,
        durationMs: 30_000,
        magnitude: 5,
        tickIntervalMs: 3_000,
        damageType: "earth",
      },
      0,
    );
    cureHarness.combat.castSpell(
      cureHarness.session,
      {
        type: "cast-spell",
        spellId: "exana-pox",
        target: { kind: "self" },
      },
      1_000,
    );

    expect(cureHarness.player.conditions.has("poison")).toBe(false);
  });

  it("enforces reviewed player-target healing callback rules", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(18, "Druid", 3),
    });
    const friend = new Player(
      {
        ...makeLeveledCharacter(18, "Druid", 3),
        id: "00000000-0000-4000-8000-000000000030",
        displayName: "Friend",
        normalizedName: "friend",
        health: 100,
      },
      { x: 2, y: 1, z: 7 },
      0,
    );
    harness.world.addPlayer(friend);
    harness.session.knownCreatureIds.add(friend.id);

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exura-sio",
        target: { kind: "self" },
      },
      1_000,
    );
    expect(harness.sent).toContainEqual({
      type: "error",
      code: "combat-action-failed",
    });

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exura-sio",
        target: { kind: "creature", creatureId: friend.id },
      },
      1_000,
    );
    expect(friend.health).toBeGreaterThan(100);
  });

  it("commits conjured ammunition with mana, soul, and inventory as one operation", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(13, "Paladin", 0),
      inventory: [
        ownedItem(BACKPACK_ID, 2854, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "backpack",
        }),
      ],
    });
    const manaBefore = harness.player.mana;
    const soulBefore = harness.player.progression.soul;

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exevo-con",
        target: { kind: "self" },
      },
      1_000,
    );
    expect(harness.session.itemOperationPending).toBe(true);
    await settleItems(harness, 1_100);

    expect(harness.player.mana).toBe(manaBefore - 100);
    expect(harness.player.progression.soul).toBe(soulBefore - 1);
    expect(await harness.store.loadForCharacter(PLAYER_ID)).toContainEqual(
      expect.objectContaining({
        typeId: 3447,
        count: 10,
        location: expect.objectContaining({
          kind: "container",
          containerId: BACKPACK_ID,
        }),
      }),
    );
    expect(harness.session.itemOperationPending).toBe(false);
  });

  it("does not let rapid ticks bypass the authoritative attack speed", async () => {
    const harness = await makeHarness({
      inventory: [
        ownedItem(WEAPON_ID, 3273, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
    });
    const monster = makeMonster(
      "monster-instance:speed-target:0",
      { x: 2, y: 1, z: 7 },
      makeMonsterType({ health: 500, maxHealth: 500 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    harness.combat.selectTarget(harness.session, monster.id, 1_000);

    harness.combat.tick(1_000);
    const healthAfterFirst = monster.health;
    harness.combat.tick(1_000);
    harness.combat.tick(
      1_000 + harness.player.progression.attackSpeedMs - 1,
    );

    expect(monster.health).toBe(healthAfterFirst);
    harness.combat.tick(
      1_000 + harness.player.progression.attackSpeedMs,
    );
    expect(monster.health).toBeLessThan(healthAfterFirst);
  });

  it("lets a level-one Knight damage Canary's dog with the starter sabre", async () => {
    const harness = await makeHarness({
      inventory: [
        ownedItem(WEAPON_ID, 3273, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
    });
    harness.session.fightMode.attack = "offensive";
    const dog = makeMonster(
      "monster-instance:dog:0",
      { x: 2, y: 1, z: 7 },
      makeMonsterType({
        id: "dog",
        name: "Dog",
        description: "a dog",
        health: 500,
        maxHealth: 500,
        experience: 0,
        defenses: [
          {
            kind: "stats",
            intervalMs: 0,
            chance: 100,
            target: "self",
            range: 0,
            area: { shape: "single" },
            defense: 5,
            armor: 5,
          },
        ],
      }),
    );
    dog.tickDefense(0);
    dog.tickDefense(1_000);
    harness.world.addCreature(dog);
    harness.session.knownCreatureIds.add(dog.id);
    harness.combat.selectTarget(harness.session, dog.id, 1_000);

    for (let attack = 0; attack < 20; attack++) {
      harness.combat.tick(
        1_000 + attack * harness.player.progression.attackSpeedMs,
      );
    }

    expect(dog.health).toBeLessThanOrEqual(488);
  });

  it("revalidates projectile blockers and protection zones at execution", async () => {
    const blockedHarness = await makeHarness({
      map: makeMap([[2, 1]]),
      inventory: [
        ownedItem(WEAPON_ID, 3277, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
    });
    const blockedTarget = makeMonster(
      "monster-instance:blocked:0",
      { x: 3, y: 1, z: 7 },
    );
    blockedHarness.world.addCreature(blockedTarget);
    blockedHarness.session.knownCreatureIds.add(blockedTarget.id);
    blockedHarness.combat.selectTarget(
      blockedHarness.session,
      blockedTarget.id,
      1_000,
    );
    blockedHarness.combat.tick(1_000);

    expect(blockedTarget.health).toBe(blockedTarget.maxHealth);

    const protectedHarness = await makeHarness({
      map: makeMap([], [{ x: 1, y: 1, z: 7 }]),
    });
    const protectedTarget = makeMonster(
      "monster-instance:protected:0",
      { x: 2, y: 1, z: 7 },
    );
    protectedHarness.world.addCreature(protectedTarget);
    protectedHarness.session.knownCreatureIds.add(protectedTarget.id);
    protectedHarness.combat.selectTarget(
      protectedHarness.session,
      protectedTarget.id,
      1_000,
    );

    expect(protectedHarness.session.attackTargetId).toBeNull();
    expect(protectedTarget.health).toBe(protectedTarget.maxHealth);
  });

  it("requires insecure mode for PVP and enforces no-PVP tiles", async () => {
    const harness = await makeHarness();
    const victim = new Player(
      makeCharacter("00000000-0000-4000-8000-000000000020", "Victim"),
      { x: 2, y: 1, z: 7 },
      0,
    );
    harness.world.addPlayer(victim);
    harness.session.knownCreatureIds.add(victim.id);

    harness.combat.selectTarget(harness.session, victim.id, 1_000);
    expect(harness.session.attackTargetId).toBeNull();
    harness.combat.setFightMode(
      harness.session,
      {
        type: "set-fight-mode",
        mode: { attack: "offensive", chase: false, secure: false },
      },
      1_000,
    );
    harness.combat.selectTarget(harness.session, victim.id, 1_000);
    harness.combat.tick(1_000);

    expect(victim.health).toBeLessThan(victim.maxHealth);
    expect(harness.player.conditions.has("pz-lock")).toBe(true);

    const noPvpHarness = await makeHarness({
      map: makeMap([], [], [{ x: 1, y: 1, z: 7 }]),
    });
    const safeVictim = new Player(
      makeCharacter("00000000-0000-4000-8000-000000000021", "Safe"),
      { x: 2, y: 1, z: 7 },
      0,
    );
    noPvpHarness.world.addPlayer(safeVictim);
    noPvpHarness.session.knownCreatureIds.add(safeVictim.id);
    noPvpHarness.combat.setFightMode(
      noPvpHarness.session,
      {
        type: "set-fight-mode",
        mode: { attack: "balanced", chase: false, secure: false },
      },
      1_000,
    );
    noPvpHarness.combat.selectTarget(
      noPvpHarness.session,
      safeVictim.id,
      1_000,
    );

    expect(noPvpHarness.session.attackTargetId).toBeNull();
  });

  it("consumes one owned rune after commit and rejects pending or stale replay", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(50, "Knight", 15),
      inventory: [
        ownedItem(
          RUNE_ID,
          3155,
          {
            kind: "inventory",
            characterId: PLAYER_ID,
            slot: 0,
          },
          2,
        ),
      ],
    });
    const monster = makeMonster(
      "monster-instance:rune-target:0",
      { x: 2, y: 1, z: 7 },
      makeMonsterType({ health: 500, maxHealth: 500 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    harness.combat.selectTarget(harness.session, monster.id, 1_000);
    const intent = {
      type: "use-rune" as const,
      itemId: RUNE_ID,
      revision: 1,
      target: { kind: "attack-target" as const },
    };

    harness.combat.useRune(harness.session, intent, 1_000);
    harness.combat.useRune(harness.session, intent, 1_000);
    await settleItems(harness, 1_000);
    harness.combat.useRune(harness.session, intent, 3_000);

    await expect(harness.store.loadForCharacter(PLAYER_ID)).resolves.toEqual([
      expect.objectContaining({ id: RUNE_ID, count: 1, version: 2 }),
    ]);
    expect(monster.health).toBeLessThan(monster.maxHealth);
    expect(
      harness.sent.filter(
        (message) =>
          message.type === "error" &&
          message.code === "combat-action-failed",
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("uses a restorative potion on self once and enforces its shared exhaust", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(80, "Knight"),
      inventory: [
        ownedItem(
          POTION_ID,
          239,
          {
            kind: "inventory",
            characterId: PLAYER_ID,
            slot: 0,
          },
          2,
        ),
      ],
    });
    harness.player.setHealth(harness.player.maxHealth - 600);
    const healthBefore = harness.player.health;
    const firstIntent = {
      type: "use-potion" as const,
      itemId: POTION_ID,
      revision: 1,
      targetPlayerId: PLAYER_ID,
    };

    harness.combat.usePotion(harness.session, firstIntent, 1_000);
    expect(harness.player.health).toBeGreaterThanOrEqual(healthBefore + 425);
    expect(harness.player.health).toBeLessThanOrEqual(healthBefore + 575);
    expect(harness.session.combatCooldowns.get("potion")?.readyAt).toBe(2_000);
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === POTION_ID),
    ).toMatchObject({ count: 1, version: 2 });
    harness.combat.usePotion(harness.session, firstIntent, 1_000);
    await settleItems(harness, 1_000);
    harness.combat.usePotion(
      harness.session,
      { ...firstIntent, revision: 2 },
      1_500,
    );

    expect(harness.player.health).toBeGreaterThanOrEqual(healthBefore + 425);
    expect(harness.player.health).toBeLessThanOrEqual(healthBefore + 575);
    expect(harness.session.combatCooldowns.get("potion")?.readyAt).toBe(2_000);
    expect(
      harness.sent.some(
        (message) =>
          message.type === "error" && message.code === "potion-exhausted",
      ),
    ).toBe(true);
    await expect(harness.store.loadForCharacter(PLAYER_ID)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: POTION_ID,
          typeId: 239,
          count: 1,
          version: 2,
        }),
        expect.objectContaining({ typeId: 284, count: 1 }),
      ]),
    );
  });

  it("disconnects and poisons character persistence when an optimistic potion write fails", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(80, "Knight"),
      inventory: [
        ownedItem(POTION_ID, 239, {
          kind: "inventory",
          characterId: PLAYER_ID,
          slot: 0,
        }),
      ],
    });
    harness.player.setHealth(harness.player.maxHealth - 600);
    harness.store.usePotion = async () => {
      throw new Error("db down");
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    harness.combat.usePotion(
      harness.session,
      {
        type: "use-potion",
        itemId: POTION_ID,
        revision: 1,
        targetPlayerId: PLAYER_ID,
      },
      1_000,
    );

    expect(harness.player.health).toBeGreaterThan(
      harness.player.maxHealth - 600,
    );
    await settleItems(harness, 1_000);

    expect(harness.persistence.failExternalMutation).toHaveBeenCalledOnce();
    expect(harness.terminate).toHaveBeenCalled();
    error.mockRestore();
  });

  it("allows a restorative potion to heal an adjacent visible player", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(80, "Knight"),
      inventory: [
        ownedItem(POTION_ID, 239, {
          kind: "inventory",
          characterId: PLAYER_ID,
          slot: 0,
        }),
      ],
    });
    const friendCharacter = {
      ...makeLeveledCharacter(80, "Knight"),
      id: FRIEND_ID,
      displayName: "Friend",
      normalizedName: "friend",
    };
    const friend = new Player(friendCharacter, { x: 2, y: 1, z: 7 }, 0);
    friend.setHealth(friend.maxHealth - 600);
    const friendHealthBefore = friend.health;
    harness.world.addPlayer(friend);
    harness.session.knownCreatureIds.add(friend.id);

    harness.combat.usePotion(
      harness.session,
      {
        type: "use-potion",
        itemId: POTION_ID,
        revision: 1,
        targetPlayerId: friend.id,
      },
      1_000,
    );
    await settleItems(harness, 1_000);

    expect(friend.health).toBeGreaterThanOrEqual(friendHealthBefore + 425);
    expect(friend.health).toBeLessThanOrEqual(friendHealthBefore + 575);
    expect(harness.player.health).toBe(harness.player.maxHealth);
    await expect(harness.store.loadForCharacter(PLAYER_ID)).resolves.toEqual([
      expect.objectContaining({
        id: POTION_ID,
        typeId: 284,
        count: 1,
        version: 2,
      }),
    ]);
  });

  it("rejects out-of-range and vocation-restricted potion targets without consuming", async () => {
    const farHarness = await makeHarness({
      inventory: [
        ownedItem(POTION_ID, 266, {
          kind: "inventory",
          characterId: PLAYER_ID,
          slot: 0,
        }),
      ],
    });
    const farCharacter = {
      ...makeLeveledCharacter(),
      id: FRIEND_ID,
      displayName: "Far Friend",
      normalizedName: "far friend",
    };
    const farFriend = new Player(farCharacter, { x: 3, y: 1, z: 7 }, 0);
    farFriend.setHealth(farFriend.maxHealth - 20);
    farHarness.world.addPlayer(farFriend);
    farHarness.session.knownCreatureIds.add(farFriend.id);
    farHarness.combat.usePotion(
      farHarness.session,
      {
        type: "use-potion",
        itemId: POTION_ID,
        revision: 1,
        targetPlayerId: farFriend.id,
      },
      1_000,
    );

    const vocationHarness = await makeHarness({
      character: makeLeveledCharacter(80, "Sorcerer"),
      inventory: [
        ownedItem(POTION_ID, 239, {
          kind: "inventory",
          characterId: PLAYER_ID,
          slot: 0,
        }),
      ],
    });
    vocationHarness.player.setHealth(vocationHarness.player.health - 100);
    vocationHarness.combat.usePotion(
      vocationHarness.session,
      {
        type: "use-potion",
        itemId: POTION_ID,
        revision: 1,
        targetPlayerId: PLAYER_ID,
      },
      1_000,
    );

    expect(farFriend.health).toBe(farFriend.maxHealth - 20);
    await expect(farHarness.store.loadForCharacter(PLAYER_ID)).resolves.toEqual([
      expect.objectContaining({ id: POTION_ID, typeId: 266, version: 1 }),
    ]);
    expect(
      vocationHarness.sent.some(
        (message) =>
          message.type === "error" &&
          message.code === "potion-vocation-restricted",
      ),
    ).toBe(true);
    await expect(
      vocationHarness.store.loadForCharacter(PLAYER_ID),
    ).resolves.toEqual([
      expect.objectContaining({ id: POTION_ID, typeId: 239, version: 1 }),
    ]);
  });

  it("consumes ammunition once before applying a distance attack", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(20, "Paladin", 1),
      inventory: [
        ownedItem(WEAPON_ID, 3349, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
        ownedItem(
          AMMO_ID,
          3446,
          {
            kind: "equipment",
            characterId: PLAYER_ID,
            slot: "ammo",
          },
          2,
        ),
      ],
    });
    const monster = makeMonster(
      "monster-instance:distance-target:0",
      { x: 3, y: 1, z: 7 },
      makeMonsterType({ health: 200, maxHealth: 200 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    harness.combat.selectTarget(harness.session, monster.id, 1_000);
    harness.combat.tick(1_000);
    await settleItems(harness, 1_000);

    await expect(harness.store.loadForCharacter(PLAYER_ID)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: AMMO_ID, count: 1, version: 2 }),
      ]),
    );
    expect(
      harness.sent.some((message) => message.type === "combat-text"),
    ).toBe(true);
  });

  it("uses wand mana and server formulas without consuming the weapon", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(8, "Sorcerer", 1),
      inventory: [
        ownedItem(WEAPON_ID, 3074, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
    });
    const monster = makeMonster(
      "monster-instance:wand-target:0",
      { x: 3, y: 1, z: 7 },
      makeMonsterType({ health: 100, maxHealth: 100 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    const manaBefore = harness.player.mana;

    harness.combat.selectTarget(harness.session, monster.id, 1_000);
    harness.combat.tick(1_000);

    expect(harness.player.mana).toBe(manaBefore - 1);
    expect(monster.health).toBeLessThan(monster.maxHealth);
    await expect(harness.store.loadForCharacter(PLAYER_ID)).resolves.toEqual([
      expect.objectContaining({ id: WEAPON_ID, version: 1 }),
    ]);
  });

  it("rechecks equipped weapon requirements when an attack executes", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(1, "Sorcerer", 0),
      inventory: [
        ownedItem(WEAPON_ID, 3074, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
    });
    const monster = makeMonster(
      "monster-instance:requirement-target:0",
      { x: 2, y: 1, z: 7 },
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    const manaBefore = harness.player.mana;
    harness.combat.selectTarget(harness.session, monster.id, 1_000);
    harness.combat.tick(1_000);

    expect(monster.health).toBe(monster.maxHealth);
    expect(harness.player.mana).toBe(manaBefore);
    expect(harness.session.attackTargetId).toBeNull();
  });

  it("applies elemental immunity, armor mitigation, and leech special effects", async () => {
    const immune = await makeHarness({
      inventory: [
        ownedItem(WEAPON_ID, 3273, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
    });
    const immuneMonster = makeMonster(
      "monster-instance:immune:0",
      { x: 2, y: 1, z: 7 },
      makeMonsterType({ elements: { physical: 100 } }),
    );
    immune.world.addCreature(immuneMonster);
    immune.session.knownCreatureIds.add(immuneMonster.id);
    immune.combat.selectTarget(immune.session, immuneMonster.id, 1_000);
    immune.combat.tick(1_000);

    expect(immuneMonster.health).toBe(immuneMonster.maxHealth);
    expect(
      immune.sent.some(
        (message) =>
          message.type === "combat-text" && message.block === "immunity",
      ),
    ).toBe(true);

    const unarmored = await makeHarness();
    const armored = await makeHarness({
      inventory: [
        ownedItem(WEAPON_ID, 3357, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "armor",
        }),
      ],
    });
    const fixedHit: MonsterAbility = {
      kind: "damage",
      intervalMs: 1_000,
      chance: 100,
      target: "target",
      range: 2,
      area: { shape: "single" },
      damageType: "physical",
      minimum: 40,
      maximum: 40,
    };
    const firstAttacker = makeMonster(
      "monster-instance:armor-test-a:0",
      { x: 2, y: 1, z: 7 },
    );
    const secondAttacker = makeMonster(
      "monster-instance:armor-test-b:0",
      { x: 2, y: 1, z: 7 },
    );
    unarmored.world.addCreature(firstAttacker);
    armored.world.addCreature(secondAttacker);
    unarmored.combat.executeMonsterAbility(
      firstAttacker,
      unarmored.player,
      fixedHit,
      1_000,
    );
    armored.combat.executeMonsterAbility(
      secondAttacker,
      armored.player,
      fixedHit,
      1_000,
    );

    expect(
      armored.player.maxHealth - armored.player.health,
    ).toBeLessThan(
      unarmored.player.maxHealth - unarmored.player.health,
    );

    const leech = await makeHarness({
      character: makeLeveledCharacter(400, "Knight", 10),
      inventory: [
        ownedItem(WEAPON_ID, 34082, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
    });
    const leechTarget = makeMonster(
      "monster-instance:leech-target:0",
      { x: 2, y: 1, z: 7 },
      makeMonsterType({ health: 5_000, maxHealth: 5_000 }),
    );
    leech.world.addCreature(leechTarget);
    leech.session.knownCreatureIds.add(leechTarget.id);
    leech.player.setHealth(leech.player.health - 100);
    leech.player.spendMana(100);
    const healthBefore = leech.player.health;
    const manaBefore = leech.player.mana;
    leech.combat.selectTarget(leech.session, leechTarget.id, 1_000);
    leech.combat.tick(1_000);

    expect(leech.player.health).toBeGreaterThan(healthBefore);
    expect(leech.player.mana).toBeGreaterThan(manaBefore);
  });

  it("aims an untargeted monster wave toward its current target", async () => {
    const harness = await makeHarness({ position: { x: 1, y: 1, z: 7 } });
    const attacker = makeMonster(
      "monster-instance:wave-caster:0",
      { x: 1, y: 4, z: 7 },
    );
    const wave: MonsterAbility = {
      kind: "damage",
      intervalMs: 1_000,
      chance: 100,
      target: "direction",
      range: 0,
      area: { shape: "cone", length: 4, spread: 3 },
      damageType: "fire",
      minimum: 10,
      maximum: 10,
    };
    harness.world.addCreature(attacker);

    const executed = harness.combat.executeMonsterAbility(
      attacker,
      harness.player,
      wave,
      1_000,
    );

    expect(executed).toBe(true);
    expect(harness.player.health).toBe(harness.player.maxHealth - 10);
  });

  it("applies the experience death penalty exactly once per death", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(8),
    });
    const attacker = makeMonster(
      "monster-instance:executioner:0",
      { x: 2, y: 1, z: 7 },
    );
    harness.world.addCreature(attacker);
    harness.session.knownCreatureIds.add(attacker.id);
    const experienceBefore = harness.player.experience;
    const expectedLoss = Math.floor(experienceBefore / 10);
    const lethal: MonsterAbility = {
      kind: "damage",
      intervalMs: 1_000,
      chance: 100,
      target: "target",
      range: 32,
      area: { shape: "single" },
      damageType: "physical",
      minimum: 100_000,
      maximum: 100_000,
    };

    harness.combat.executeMonsterAbility(attacker, harness.player, lethal, 1_000);
    harness.combat.executeMonsterAbility(attacker, harness.player, lethal, 1_000);

    expect(harness.player.experience).toBe(experienceBefore - expectedLoss);
    expect(harness.player.level).toBeLessThan(8);
    expect(harness.player.health).toBe(harness.player.maxHealth);
    expect(harness.player.maxHealth).toBe(
      harness.player.progression.maxHealth,
    );
    expect(harness.player.position).toEqual(harness.world.templePosition);
    expect(
      harness.sent.filter(
        (message) =>
          message.type === "combat-log" &&
          message.kind === "experience" &&
          message.text.startsWith("You lost"),
      ),
    ).toHaveLength(1);
  });

  it("resolves direct, damage-over-time, and disconnected death paths once", async () => {
    const direct = await makeHarness();
    const attacker = makeMonster(
      "monster-instance:killer:0",
      { x: 2, y: 1, z: 7 },
    );
    direct.world.addCreature(attacker);
    direct.session.knownCreatureIds.add(attacker.id);
    const lethal: MonsterAbility = {
      kind: "damage",
      intervalMs: 1_000,
      chance: 100,
      target: "target",
      range: 32,
      area: { shape: "single" },
      damageType: "physical",
      minimum: 10_000,
      maximum: 10_000,
    };

    direct.combat.executeMonsterAbility(attacker, direct.player, lethal, 1_000);
    direct.combat.executeMonsterAbility(attacker, direct.player, lethal, 1_000);

    expect(
      direct.sent.filter(
        (message) =>
          message.type === "combat-log" && message.kind === "death",
      ),
    ).toHaveLength(1);
    expect(direct.player.health).toBe(direct.player.maxHealth);

    const overTime = await makeHarness();
    const conditionSource = makeMonster(
      "monster-instance:condition-source:0",
      { x: 2, y: 1, z: 7 },
    );
    overTime.world.addCreature(conditionSource);
    overTime.session.knownCreatureIds.add(conditionSource.id);
    overTime.combat.executeMonsterAbility(
      conditionSource,
      overTime.player,
      {
        kind: "condition",
        intervalMs: 1_000,
        chance: 100,
        target: "target",
        range: 2,
        area: { shape: "single" },
        conditionType: "fire",
        durationMs: 5_000,
        magnitude: 10_000,
        tickIntervalMs: 1_000,
        damageType: "fire",
      },
      0,
    );
    overTime.combat.tick(1_000);
    overTime.combat.tick(2_000);

    expect(
      overTime.sent.filter(
        (message) =>
          message.type === "combat-log" && message.kind === "death",
      ),
    ).toHaveLength(1);

    const disconnected = await makeHarness();
    const disconnectedSource = makeMonster(
      "monster-instance:disconnected-source:0",
      { x: 2, y: 1, z: 7 },
    );
    disconnected.world.addCreature(disconnectedSource);
    disconnected.combat.executeMonsterAbility(
      disconnectedSource,
      disconnected.player,
      {
        kind: "condition",
        intervalMs: 1_000,
        chance: 100,
        target: "target",
        range: 2,
        area: { shape: "single" },
        conditionType: "energy",
        durationMs: 5_000,
        magnitude: 10_000,
        tickIntervalMs: 1_000,
        damageType: "energy",
      },
      0,
    );
    disconnected.world.removePlayer(disconnected.player.id);
    disconnected.session.playerId = null;
    disconnected.combat.tick(1_000);

    expect(
      disconnected.sent.some(
        (message) =>
          message.type === "combat-log" && message.kind === "death",
      ),
    ).toBe(false);
  });
});
