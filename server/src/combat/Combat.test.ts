import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
  DEFAULT_LOOT_FILTER,
  EMPTY_WHEEL_BONUSES,
  type ActionBar,
  type ActionBarAction,
  type ActionBotSettings,
  type CharacterVocation,
  type ServerErrorCode,
  type ServerMessage,
  type WheelBonuses,
} from "@tibia/protocol";
import type { AccountStore } from "../AccountStore";
import type { Character } from "../character/Character";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { CharacterStore } from "../character/CharacterStore";
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
import type { PartyHooks } from "../party/PartyHooks";
import { Player } from "../Player";
import { positionKey } from "../positionKey";
import { aimDirectionFor } from "./aimDirectionFor";
import { SpellRegistry } from "./SpellRegistry";
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
import { CombatIntentHandler } from "./CombatIntentHandler";
import type { ItemUseHooks } from "./ItemUseHooks";
import type { WorldSpellHooks } from "./WorldSpellHooks";

const PLAYER_ID = "00000000-0000-4000-8000-000000000010";
const WEAPON_ID = "00000000-0000-4000-8000-000000000011";
const AMMO_ID = "00000000-0000-4000-8000-000000000012";
const RUNE_ID = "00000000-0000-4000-8000-000000000013";
const BACKPACK_ID = "00000000-0000-4000-8000-000000000014";
const POTION_ID = "00000000-0000-4000-8000-000000000015";
const FRIEND_ID = "00000000-0000-4000-8000-000000000016";
const ARMOR_ID = "00000000-0000-4000-8000-000000000017";
const MANA_POTION_ID = "00000000-0000-4000-8000-000000000018";

let catalog: ItemCatalog;

beforeAll(async () => {
  catalog = await loadItemCatalog();
});

function actionBarWith(
  actions: ReadonlyArray<ActionBarAction>,
): ActionBar {
  return createDefaultActionBar().map((slot, index) => ({
    ...slot,
    action: actions[index] ?? null,
  }));
}

/** A second connected player used to assert what observers may receive. */
interface Bystander {
  readonly player: Player;
  readonly session: Session;
  readonly sent: ServerMessage[];
}

interface Harness {
  readonly world: World;
  readonly player: Player;
  readonly session: Session;
  readonly bystanders: ReadonlyArray<Bystander>;
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
    race: "blood",
    faction: "default",
    enemyFactions: [],
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
      canWalkOnEnergy: false,
      canWalkOnFire: false,
      canWalkOnPoison: false,
      isBlockable: true,
      rewardBoss: false,
    },
    targetStrategy: { nearest: 100, health: 0, damage: 0, random: 0 },
    attacks: [],
    defenses: [],
    elements: {},
    immunities: [],
    reflects: {},
    heals: {},
    events: [],
    callbacks: [],
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

/** Minimal session stub for observers: only what Visibility reads. */
function makeBystander(
  world: World,
  index: number,
  position: { x: number; y: number; z: number },
): Bystander {
  const sent: ServerMessage[] = [];
  const player = new Player(
    {
      ...makeLeveledCharacter(),
      id: `00000000-0000-4000-8000-00000000002${index}`,
      displayName: `Bystander ${index}`,
      normalizedName: `bystander ${index}`,
    },
    position,
    0,
  );
  world.addPlayer(player);
  const session = {
    id: `session-bystander-${index}`,
    playerId: player.id,
    viewRange: { x: 8, y: 6 },
    knownCreatureIds: new Set([player.id]),
    knownMapItemTiles: new Map(),
    attackTargetId: null,
    followTargetId: null,
    aimAtTargetSpellIds: new Set<string>(),
    combatCooldowns: new Map(),
    lootFilter: { ...DEFAULT_LOOT_FILTER, pickupRules: [] },
    send: (message: ServerMessage) => sent.push(message),
    sendSerialized: (message: string) =>
      sent.push(JSON.parse(message) as ServerMessage),
    sendError: () => undefined,
  } as unknown as Session;
  return { player, session, sent };
}

async function makeHarness(options: {
  character?: Character;
  position?: { x: number; y: number; z: number };
  map?: MapData;
  bystanderPositions?: ReadonlyArray<{ x: number; y: number; z: number }>;
  inventory?: ReadonlyArray<Item>;
  partyMembership?: { sameParty: boolean };
  actionBar?: ActionBar;
  actionBotSettings?: ActionBotSettings;
  worldSpells?: WorldSpellHooks;
  wheelBonuses?: WheelBonuses;
  itemUse?: ItemUseHooks;
} = {}): Promise<Harness> {
  const world = new World(
    options.map ?? makeMap(),
    25,
  );
  const player = new Player(
    options.character ?? makeLeveledCharacter(),
    options.position ?? { x: 1, y: 1, z: 7 },
    0,
    null,
    options.wheelBonuses,
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
    followTargetId: null,
    aimAtTargetSpellIds: new Set<string>(),
    lootFilter: { ...DEFAULT_LOOT_FILTER, pickupRules: [] },
    nextCombatAnalyzerAt: 0,
    itemOperationPending: false,
    potionPersistPending: false,
    actionBar: options.actionBar ?? createDefaultActionBar(),
    actionBotSettings:
      options.actionBotSettings ?? { ...DEFAULT_ACTION_BOT_SETTINGS },
    actionBotRuleReadyAt: new Map(),
    actionBotSuppressedAt: Number.NEGATIVE_INFINITY,
    errorRevision: 0,
    itemPersistsPending: 0,
    movementDirection: null,
    bufferedMovementDirection: null,
    send: (message: ServerMessage) => sent.push(message),
    sendSerialized: (message: string) =>
      sent.push(JSON.parse(message) as ServerMessage),
    sendError: (code: ServerErrorCode) => {
      session.errorRevision += 1;
      sent.push({ type: "error", code });
    },
    terminate,
  } as unknown as Session;
  const bystanders = (options.bystanderPositions ?? []).map(
    (position, index) => makeBystander(world, index, position),
  );
  const registry = {
    all: () => [session, ...bystanders.map((bystander) => bystander.session)],
    sessionFor: (playerId: string) =>
      playerId === player.id
        ? session
        : bystanders.find((bystander) => bystander.player.id === playerId)
            ?.session,
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registry);
  const store = new MemoryItemStore(catalog);
  const inventory = options.inventory ?? [];
  if (
    inventory.some(
      (item) =>
        item.location.kind === "container" &&
        item.location.containerId === BACKPACK_ID,
    ) &&
    !inventory.some((item) => item.id === BACKPACK_ID)
  ) {
    store.seed(
      ownedItem(BACKPACK_ID, 2854, {
        kind: "equipment",
        characterId: PLAYER_ID,
        slot: "backpack",
      }),
    );
  }
  for (const item of inventory) store.seed(item);
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
    undefined,
    options.partyMembership
      ? {
          sameParty: () => options.partyMembership?.sameParty ?? false,
          recordMonsterDamage: () => undefined,
          recordPartnerHeal: () => undefined,
          getExperienceShares: () => null,
          getQuestParticipantIds: (playerId) => [playerId],
          getPartyMemberIds: (playerId) => [playerId],
        } satisfies PartyHooks
      : undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.itemUse,
    options.worldSpells,
  );
  return {
    world,
    player,
    session,
    bystanders,
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
    expect(harness.player.experience).toBe(5n);
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
          message.code === "spell-exhausted",
      ),
    ).toBe(true);
    expect(
      harness.session.combatCooldowns.get("group:healing")?.readyAt,
    ).toBe(2_000);
    const latestFightState = harness.sent
      .filter((message) => message.type === "fight-state")
      .at(-1);
    expect(latestFightState?.fightState.cooldowns).toContainEqual({
      group: "group:healing",
      readyAt: 2_000,
      remainingMs: 1_000,
      totalMs: 1_000,
    });
  });

  it("casts a spell from its spoken words, normalizing case and spacing", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(20, "Knight", 3),
    });
    harness.player.setHealth(harness.player.health - 50);
    const manaBefore = harness.player.mana;

    const matched = harness.combat.castSpellByWords(
      harness.session,
      "  Exura   INFIR ico ",
      1_000,
    );

    expect(matched).toBe("cast");
    expect(harness.player.health).toBeGreaterThan(
      harness.player.maxHealth - 50,
    );
    expect(harness.player.mana).toBe(manaBefore - 10);
  });

  it("still enforces vocation and resources on spoken spell words", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(20, "Knight", 3),
    });
    const manaBefore = harness.player.mana;

    // "exura" belongs to other vocations; matching the words must not
    // bypass the cast pipeline's vocation check.
    const matched = harness.combat.castSpellByWords(
      harness.session,
      "exura",
      1_000,
    );

    expect(matched).toBe("rejected");
    expect(harness.player.mana).toBe(manaBefore);
    expect(
      harness.sent.some((message) => message.type === "error"),
    ).toBe(true);
  });

  it("ignores spoken text that matches no spell words", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(20, "Knight", 3),
    });

    const matched = harness.combat.castSpellByWords(
      harness.session,
      "hello there",
      1_000,
    );

    expect(matched).toBe("no-match");
    expect(harness.sent).toEqual([]);
  });

  it("casts exani tera through the movement hook and pays only on success", async () => {
    const magicRope = vi.fn().mockReturnValue(true);
    const harness = await makeHarness({
      character: makeLeveledCharacter(20, "Knight", 3),
      worldSpells: { magicRope, levitate: vi.fn() },
    });
    const manaBefore = harness.player.mana;

    expect(
      harness.combat.castSpellByWords(harness.session, "exani tera", 1_000),
    ).toBe("cast");

    expect(magicRope).toHaveBeenCalledWith(harness.session, 1_000);
    expect(harness.player.mana).toBe(manaBefore - 20);
    expect(
      harness.session.combatCooldowns.get("spell:exani-tera")?.readyAt,
    ).toBe(3_000);
  });

  it("rejects exani tera off a rope spot without spending mana", async () => {
    const magicRope = vi.fn().mockReturnValue(false);
    const harness = await makeHarness({
      character: makeLeveledCharacter(20, "Knight", 3),
      worldSpells: { magicRope, levitate: vi.fn() },
    });
    const manaBefore = harness.player.mana;

    harness.combat.castSpellByWords(harness.session, "exani tera", 1_000);

    expect(harness.player.mana).toBe(manaBefore);
    expect(harness.sent).toContainEqual({
      type: "error",
      code: "spell-not-possible",
    });
    expect(
      harness.session.combatCooldowns.get("spell:exani-tera"),
    ).toBeUndefined();
  });

  it("passes the spoken exani hur parameter to the levitate hook", async () => {
    const levitate = vi.fn().mockReturnValue(true);
    const harness = await makeHarness({
      character: makeLeveledCharacter(20, "Knight", 3),
      worldSpells: { magicRope: vi.fn(), levitate },
    });

    harness.combat.castSpellByWords(harness.session, 'exani hur "up"', 1_000);
    harness.combat.castSpellByWords(harness.session, "exani hur down", 5_000);

    expect(levitate).toHaveBeenNthCalledWith(1, harness.session, "up", 1_000);
    expect(levitate).toHaveBeenNthCalledWith(2, harness.session, "down", 5_000);
  });

  it("rejects exani hur without a valid up/down parameter", async () => {
    const levitate = vi.fn();
    const harness = await makeHarness({
      character: makeLeveledCharacter(20, "Knight", 3),
      worldSpells: { magicRope: vi.fn(), levitate },
    });
    const manaBefore = harness.player.mana;

    harness.combat.castSpellByWords(harness.session, "exani hur", 1_000);
    harness.combat.castSpellByWords(harness.session, "exani hur sideways", 2_000);

    expect(levitate).not.toHaveBeenCalled();
    expect(harness.player.mana).toBe(manaBefore);
    expect(
      harness.sent.filter(
        (message) =>
          message.type === "error" && message.code === "spell-not-possible",
      ),
    ).toHaveLength(2);
  });

  it("casts exani hur from an action bar slot carrying its parameter", async () => {
    const levitate = vi.fn().mockReturnValue(true);
    const harness = await makeHarness({
      character: makeLeveledCharacter(20, "Knight", 3),
      worldSpells: { magicRope: vi.fn(), levitate },
      actionBar: actionBarWith([
        {
          kind: "spell",
          spellId: "exani-hur",
          targetMode: "self",
          parameter: "down",
        },
      ]),
    });

    harness.combat.activateActionBar(
      harness.session,
      { type: "activate-action-bar", slotIndex: 0 },
      1_000,
    );

    expect(levitate).toHaveBeenCalledWith(harness.session, "down", 1_000);
  });

  it("casts a spoken name parameter at the visible player it names", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(30, "Druid", 10),
      bystanderPositions: [{ x: 4, y: 1, z: 7 }],
    });
    const [friend] = harness.bystanders;
    if (!friend) throw new Error("expected a bystander");
    harness.session.knownCreatureIds.add(friend.player.id);
    friend.player.setHealth(friend.player.maxHealth - 100);
    const healthBefore = friend.player.health;
    const manaBefore = harness.player.mana;

    expect(
      harness.combat.castSpellByWords(
        harness.session,
        `exura sio "${friend.player.name}"`,
        1_000,
      ),
    ).toBe("cast");

    expect(friend.player.health).toBeGreaterThan(healthBefore);
    expect(harness.player.mana).toBeLessThan(manaBefore);
  });

  // Charter rule 6: a name the caster cannot see must not become a cast, or
  // the spell turns into an out-of-view player locator.
  it("refuses a spoken name the caster cannot see", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(30, "Druid", 10),
      bystanderPositions: [{ x: 4, y: 1, z: 7 }],
    });
    const [friend] = harness.bystanders;
    if (!friend) throw new Error("expected a bystander");
    friend.player.setHealth(friend.player.maxHealth - 100);
    const healthBefore = friend.player.health;
    const manaBefore = harness.player.mana;

    expect(
      harness.combat.castSpellByWords(
        harness.session,
        `exura sio "${friend.player.name}"`,
        1_000,
      ),
    ).toBe("rejected");

    expect(friend.player.health).toBe(healthBefore);
    expect(harness.player.mana).toBe(manaBefore);
    expect(harness.sent).toContainEqual({
      type: "error",
      code: "spell-parameter-invalid",
    });
  });

  it("leaves trailing words on a parameterless spell as ordinary speech", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(30, "Druid", 10),
    });
    const manaBefore = harness.player.mana;

    expect(
      harness.combat.castSpellByWords(
        harness.session,
        "exura hello there",
        1_000,
      ),
    ).toBe("no-match");

    expect(harness.player.mana).toBe(manaBefore);
    expect(harness.sent).toEqual([]);
  });

  it("reports execution-time Exori rejection reasons", async () => {
    const lowLevel = await makeHarness({
      character: makeLeveledCharacter(34, "Knight"),
    });
    lowLevel.combat.castSpell(
      lowLevel.session,
      {
        type: "cast-spell",
        spellId: "exori",
        target: { kind: "self" },
      },
      1_000,
    );
    expect(lowLevel.sent).toContainEqual({
      type: "error",
      code: "spell-level-restricted",
    });

    const lowMana = await makeHarness({
      character: { ...makeLeveledCharacter(50, "Knight"), mana: 114 },
      inventory: [
        ownedItem(WEAPON_ID, 3273, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
    });
    lowMana.combat.castSpell(
      lowMana.session,
      {
        type: "cast-spell",
        spellId: "exori",
        target: { kind: "self" },
      },
      1_000,
    );
    expect(lowMana.sent).toContainEqual({
      type: "error",
      code: "spell-mana-insufficient",
    });

    const unarmed = await makeHarness({
      character: makeLeveledCharacter(50, "Knight"),
    });
    unarmed.combat.castSpell(
      unarmed.session,
      {
        type: "cast-spell",
        spellId: "exori",
        target: { kind: "self" },
      },
      1_000,
    );
    expect(unarmed.sent).toContainEqual({
      type: "error",
      code: "spell-weapon-required",
    });

    const protectionZone = await makeHarness({
      character: makeLeveledCharacter(50, "Knight"),
      map: makeMap([], [{ x: 1, y: 1, z: 7 }]),
      inventory: [
        ownedItem(WEAPON_ID, 3273, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
    });
    protectionZone.combat.castSpell(
      protectionZone.session,
      {
        type: "cast-spell",
        spellId: "exori",
        target: { kind: "self" },
      },
      1_000,
    );
    expect(protectionZone.sent).toContainEqual({
      type: "error",
      code: "spell-protection-zone",
    });

    const valid = await makeHarness({
      character: makeLeveledCharacter(50, "Knight"),
      inventory: [
        ownedItem(WEAPON_ID, 3273, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
    });
    const target = makeMonster(
      "monster-instance:exori-target:0",
      { x: 2, y: 1, z: 7 },
      makeMonsterType({ health: 500, maxHealth: 500 }),
    );
    valid.world.addCreature(target);
    valid.session.knownCreatureIds.add(target.id);
    valid.combat.castSpell(
      valid.session,
      {
        type: "cast-spell",
        spellId: "exori",
        target: { kind: "self" },
      },
      1_000,
    );
    expect(target.health).toBeLessThan(target.maxHealth);
    expect(valid.sent).not.toContainEqual({
      type: "error",
      code: "spell-target-protected",
    });
  });

  it("broadcasts Exori's effect across its full area without a creature target", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(50, "Knight"),
      position: { x: 5, y: 5, z: 7 },
      inventory: [
        ownedItem(WEAPON_ID, 3273, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
    });

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exori",
        target: { kind: "self" },
      },
      1_000,
    );

    const effects = harness.sent
      .filter((message) => message.type === "magic-effect")
      .filter((message) => message.effectId === 10);
    expect(effects).toHaveLength(9);
    expect(
      new Set(effects.map((message) => positionKey(message.position))),
    ).toEqual(
      new Set(
        [4, 5, 6].flatMap((y) =>
          [4, 5, 6].map((x) => positionKey({ x, y, z: 7 })),
        ),
      ),
    );
  });

  it("casts Scorch with one effect per tile across its imported area", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(1, "Sorcerer", 0),
      position: { x: 5, y: 5, z: 7 },
    });
    const target = makeMonster(
      "monster-instance:scorch-target:0",
      { x: 5, y: 6, z: 7 },
    );
    harness.world.addCreature(target);
    harness.session.knownCreatureIds.add(target.id);
    const manaBefore = harness.player.mana;

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exevo-infir-flam-hur",
        target: { kind: "direction" },
      },
      1_000,
    );

    expect(target.health).toBeLessThan(target.maxHealth);
    expect(target.health).toBeGreaterThanOrEqual(target.maxHealth - 4);
    expect(harness.player.mana).toBe(manaBefore - 8);
    expect(
      harness.session.combatCooldowns.get(
        "spell:exevo-infir-flam-hur",
      )?.readyAt,
    ).toBe(5_000);
    expect(
      harness.session.combatCooldowns.get("group:attack")?.readyAt,
    ).toBe(3_000);
    const effects = harness.sent
      .filter((message) => message.type === "magic-effect")
      .filter((message) => message.effectId === 16);
    expect(effects).toHaveLength(12);
    expect(
      new Set(effects.map((message) => positionKey(message.position))).size,
    ).toBe(12);
    expect(
      effects.filter(
        (message) =>
          positionKey(message.position) === positionKey(target.position),
      ),
    ).toHaveLength(1);
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
      code: "spell-target-invalid",
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

  it("restricts Nature's Embrace to a current party member", async () => {
    const partyMembership = { sameParty: false };
    const harness = await makeHarness({
      character: makeLeveledCharacter(300, "Elder Druid", 20),
      partyMembership,
    });
    const friend = new Player(
      {
        ...makeLeveledCharacter(300, "Elder Druid", 20),
        id: "00000000-0000-4000-8000-000000000031",
        displayName: "Party Friend",
        normalizedName: "party friend",
        health: 100,
      },
      { x: 2, y: 1, z: 7 },
      0,
    );
    harness.world.addPlayer(friend);
    harness.session.knownCreatureIds.add(friend.id);
    const cast = () => harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exura-gran-sio",
        target: { kind: "creature", creatureId: friend.id },
      },
      1_000,
    );

    cast();
    expect(harness.sent).toContainEqual({
      type: "error",
      code: "spell-target-invalid",
    });
    expect(friend.health).toBe(100);

    partyMembership.sameParty = true;
    cast();
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
          { kind: "container", containerId: BACKPACK_ID, slot: 0 },
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

    await expect(harness.store.loadForCharacter(PLAYER_ID)).resolves.toContainEqual(
      expect.objectContaining({ id: RUNE_ID, count: 1, version: 2 }),
    );
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
          { kind: "container", containerId: BACKPACK_ID, slot: 0 },
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

  it("auto-uses one health potion below the configured threshold without replaying while pending", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(80, "Knight"),
      inventory: [
        ownedItem(
          POTION_ID,
          239,
          { kind: "container", containerId: BACKPACK_ID, slot: 0 },
          2,
        ),
      ],
      actionBar: createDefaultActionBar(),
      actionBotSettings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        rules: [
          {
            id: "health",
            enabled: true,
            action: {
              kind: "item",
              itemTypeId: 239,
              mode: "use-on-self",
            },
            trigger: {
              kind: "resource-below",
              resource: "health",
              percent: 50,
            },
            unequipWhenInactive: false,
          },
        ],
      },
    });
    harness.player.setHealth(Math.floor(harness.player.maxHealth * 0.4));
    const healthBefore = harness.player.health;

    harness.combat.tick(1_000);
    harness.combat.tick(1_000);

    expect(harness.player.health).toBeGreaterThan(healthBefore);
    expect(harness.session.actionBotRuleReadyAt.get("health")).toBe(2_000);
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === POTION_ID),
    ).toMatchObject({ count: 1, version: 2 });
    expect(
      harness.sent.filter(
        (message) =>
          message.type === "combat-log" &&
          message.text.includes("great health potion"),
      ),
    ).toHaveLength(1);

    await settleItems(harness, 1_000);
    await expect(harness.store.loadForCharacter(PLAYER_ID)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: POTION_ID,
          count: 1,
          version: 2,
        }),
      ]),
    );
  });

  it("automatically casts haste once while its server condition is missing", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(20, "Knight"),
      actionBar: createDefaultActionBar(),
      actionBotSettings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        autoHaste: {
          enabled: true,
          spellId: "utani-hur",
        },
      },
    });
    const manaBefore = harness.player.mana;

    harness.combat.tick(1_000);
    const manaAfterCast = harness.player.mana;
    harness.combat.tick(2_000);

    expect(harness.player.conditions.has("haste")).toBe(true);
    expect(manaAfterCast).toBeLessThan(manaBefore);
    expect(harness.player.mana).toBe(manaAfterCast);
  });

  it("casts auto haste once before using a sudden death rune on its target", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(50, "Knight", 15),
      inventory: [
        ownedItem(
          RUNE_ID,
          3155,
          { kind: "container", containerId: BACKPACK_ID, slot: 0 },
          2,
        ),
      ],
      actionBar: createDefaultActionBar(),
      actionBotSettings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        autoHaste: {
          enabled: true,
          spellId: "utani-hur",
        },
        rules: [
          {
            id: "rune-target",
            enabled: true,
            action: {
              kind: "item",
              itemTypeId: 3155,
              mode: "use-on-target",
            },
            trigger: { kind: "target-present" },
            unequipWhenInactive: false,
          },
        ],
      },
    });
    const monster = makeMonster(
      "monster-instance:auto-haste-rune-target:0",
      { x: 3, y: 1, z: 7 },
      makeMonsterType({ health: 2_000, maxHealth: 2_000 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    harness.session.fightMode = {
      ...harness.session.fightMode,
      chase: false,
    };
    harness.combat.selectTarget(harness.session, monster.id, 1_000);

    harness.combat.tick(1_000);

    expect(harness.player.conditions.has("haste")).toBe(true);
    expect(harness.session.actionBotRuleReadyAt.get("auto-haste")).toBe(
      3_000,
    );
    expect(monster.health).toBe(monster.maxHealth);

    harness.combat.tick(1_050);
    await settleItems(harness, 1_050);

    expect(monster.health).toBeLessThan(monster.maxHealth);
    expect(harness.session.actionBotRuleReadyAt.get("rune-target")).toBe(
      3_050,
    );
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === RUNE_ID),
    ).toMatchObject({ count: 1, version: 2 });
  });

  it("gives a manual action-bar hotkey priority over the action bot", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(50, "Knight", 15),
      inventory: [
        ownedItem(
          RUNE_ID,
          3155,
          { kind: "container", containerId: BACKPACK_ID, slot: 0 },
          2,
        ),
      ],
      actionBar: actionBarWith([
        {
          kind: "item",
          itemTypeId: 3155,
          mode: "use-on-target",
        },
        {
          kind: "spell",
          spellId: "utani-hur",
          targetMode: "self",
        },
      ]),
      actionBotSettings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        autoHaste: {
          enabled: true,
          spellId: "utani-hur",
        },
        rules: [
          {
            id: "rune-target",
            enabled: true,
            action: {
              kind: "item",
              itemTypeId: 3155,
              mode: "use-on-target",
            },
            trigger: { kind: "target-present" },
            unequipWhenInactive: false,
          },
        ],
      },
    });
    const monster = makeMonster(
      "monster-instance:manual-priority-target:0",
      { x: 3, y: 1, z: 7 },
      makeMonsterType({ health: 2_000, maxHealth: 2_000 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    harness.session.fightMode = {
      ...harness.session.fightMode,
      chase: false,
    };
    harness.combat.selectTarget(harness.session, monster.id, 900);
    const intents = new CombatIntentHandler(
      harness.combat,
      {} as AccountStore,
      {} as SessionRegistry,
      harness.world,
      {} as CharacterStore,
    );

    intents.handle(
      harness.session,
      { type: "activate-action-bar", slotIndex: 1 },
      1_000,
    );
    harness.combat.tick(1_000);

    expect(harness.player.conditions.has("haste")).toBe(true);
    expect(monster.health).toBe(monster.maxHealth);
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === RUNE_ID),
    ).toMatchObject({ count: 2, version: 1 });

    harness.combat.tick(1_050);
    await settleItems(harness, 1_050);

    expect(monster.health).toBeLessThan(monster.maxHealth);
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === RUNE_ID),
    ).toMatchObject({ count: 1, version: 2 });
  });

  it("automatically casts utamo vita while magic shield is missing", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(20, "Sorcerer"),
      actionBar: createDefaultActionBar(),
      actionBotSettings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        autoUtamoVita: true,
      },
    });
    const manaBefore = harness.player.mana;

    harness.combat.tick(1_000);
    const manaAfterCast = harness.player.mana;
    harness.combat.tick(2_000);

    expect(harness.player.conditions.has("magic-shield")).toBe(true);
    expect(manaAfterCast).toBeLessThan(manaBefore);
    expect(harness.player.mana).toBe(manaAfterCast);
  });

  it("repairs a legacy self spell target mode when its action executes", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(20, "Knight"),
      actionBar: actionBarWith([
        {
          kind: "spell",
          spellId: "exura-infir-ico",
          targetMode: "attack-target",
        },
      ]),
    });
    harness.player.setHealth(harness.player.health - 100);
    const healthBefore = harness.player.health;

    harness.combat.activateActionBar(
      harness.session,
      { type: "activate-action-bar", slotIndex: 0 },
      1_000,
    );

    expect(harness.player.health).toBeGreaterThan(healthBefore);
    expect(harness.sent).toContainEqual({
      type: "action-bar-activation-result",
      slotIndex: 0,
      accepted: true,
    });
  });

  it("uses a crosshair sudden death rune on the selected creature", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(50, "Knight", 15),
      inventory: [
        ownedItem(
          RUNE_ID,
          3155,
          { kind: "container", containerId: BACKPACK_ID, slot: 0 },
          2,
        ),
      ],
      actionBar: actionBarWith([
        {
          kind: "item",
          itemTypeId: 3155,
          mode: "use-with-crosshair",
        },
      ]),
    });
    const monster = makeMonster(
      "monster-instance:crosshair-rune-target:0",
      { x: 2, y: 1, z: 7 },
      makeMonsterType({ health: 500, maxHealth: 500 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);

    harness.combat.activateActionBar(
      harness.session,
      {
        type: "activate-action-bar",
        slotIndex: 0,
        target: { kind: "creature", creatureId: monster.id },
      },
      1_000,
    );
    await settleItems(harness, 1_000);

    expect(harness.sent).toContainEqual({
      type: "action-bar-activation-result",
      slotIndex: 0,
      accepted: true,
    });
    expect(monster.health).toBeLessThan(monster.maxHealth);
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === RUNE_ID),
    ).toMatchObject({ count: 1, version: 2 });
  });

  it("retains one ready manual rune activation while an item operation is busy", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(50, "Knight", 15),
      inventory: [
        ownedItem(
          RUNE_ID,
          3155,
          { kind: "container", containerId: BACKPACK_ID, slot: 0 },
          2,
        ),
      ],
      actionBar: actionBarWith([
        {
          kind: "item",
          itemTypeId: 3155,
          mode: "use-on-target",
        },
      ]),
    });
    const monster = makeMonster(
      "monster-instance:queued-rune-target:0",
      { x: 2, y: 1, z: 7 },
      makeMonsterType({ health: 500, maxHealth: 500 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    harness.combat.selectTarget(harness.session, monster.id, 900);
    harness.session.itemOperationPending = true;

    harness.combat.activateActionBar(
      harness.session,
      { type: "activate-action-bar", slotIndex: 0 },
      1_000,
    );

    expect(harness.sent).toContainEqual({
      type: "action-bar-activation-result",
      slotIndex: 0,
      accepted: true,
    });
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === RUNE_ID),
    ).toMatchObject({ count: 2, version: 1 });

    harness.session.itemOperationPending = false;
    harness.combat.tick(1_025);
    await settleItems(harness, 1_050);

    expect(monster.health).toBeLessThan(monster.maxHealth);
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === RUNE_ID),
    ).toMatchObject({ count: 1, version: 2 });
  });

  it("does not replay a repeated hotkey press after its first rune commits", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(50, "Knight", 15),
      inventory: [
        ownedItem(
          RUNE_ID,
          3155,
          { kind: "container", containerId: BACKPACK_ID, slot: 0 },
          2,
        ),
      ],
      actionBar: actionBarWith([
        {
          kind: "item",
          itemTypeId: 3155,
          mode: "use-on-target",
        },
      ]),
    });
    const monster = makeMonster(
      "monster-instance:repeated-rune-target:0",
      { x: 2, y: 1, z: 7 },
      makeMonsterType({ health: 500, maxHealth: 500 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    harness.combat.selectTarget(harness.session, monster.id, 900);

    harness.combat.activateActionBar(
      harness.session,
      { type: "activate-action-bar", slotIndex: 0 },
      1_000,
    );
    harness.combat.activateActionBar(
      harness.session,
      { type: "activate-action-bar", slotIndex: 0 },
      1_000,
    );
    await settleItems(harness, 1_025);
    harness.combat.tick(1_025);

    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === RUNE_ID),
    ).toMatchObject({ count: 1, version: 2 });
    expect(
      harness.sent.filter(
        (message) =>
          message.type === "error" && message.code === "spell-exhausted",
      ),
    ).toHaveLength(0);
  });

  it("keeps a targeted action pending when the server rejects its target", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(50, "Knight", 15),
      inventory: [
        ownedItem(
          RUNE_ID,
          3155,
          { kind: "container", containerId: BACKPACK_ID, slot: 0 },
          2,
        ),
      ],
      actionBar: actionBarWith([
        {
          kind: "item",
          itemTypeId: 3155,
          mode: "use-with-crosshair",
        },
      ]),
    });

    harness.combat.activateActionBar(
      harness.session,
      {
        type: "activate-action-bar",
        slotIndex: 0,
        target: { kind: "creature", creatureId: "missing-creature" },
      },
      1_000,
    );

    expect(harness.sent).toContainEqual({
      type: "action-bar-activation-result",
      slotIndex: 0,
      accepted: false,
    });
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === RUNE_ID),
    ).toMatchObject({ count: 2, version: 1 });
  });

  it("automatically resolves a crosshair rune against the current target", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(50, "Knight", 15),
      inventory: [
        ownedItem(
          RUNE_ID,
          3155,
          { kind: "container", containerId: BACKPACK_ID, slot: 0 },
          3,
        ),
      ],
      actionBar: createDefaultActionBar(),
      actionBotSettings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        rules: [
          {
            id: "rune-target",
            enabled: true,
            action: {
              kind: "item",
              itemTypeId: 3155,
              mode: "use-with-crosshair",
            },
            trigger: { kind: "target-present" },
            unequipWhenInactive: false,
          },
        ],
      },
    });
    const monster = makeMonster(
      "monster-instance:auto-rune-target:0",
      { x: 3, y: 1, z: 7 },
      makeMonsterType({ health: 2_000, maxHealth: 2_000 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    harness.session.fightMode = {
      ...harness.session.fightMode,
      chase: false,
    };
    harness.combat.selectTarget(harness.session, monster.id, 1_000);

    harness.combat.tick(1_000);
    await settleItems(harness, 1_000);
    const healthAfterFirstRune = monster.health;

    expect(monster.health).toBeLessThan(monster.maxHealth);
    expect(harness.session.actionBotRuleReadyAt.get("rune-target")).toBe(
      3_000,
    );
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === RUNE_ID),
    ).toMatchObject({ count: 2, version: 2 });

    harness.combat.tick(2_999);
    expect(monster.health).toBe(healthAfterFirstRune);
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === RUNE_ID),
    ).toMatchObject({ count: 2, version: 2 });

    harness.combat.tick(3_000);
    await settleItems(harness, 3_000);

    expect(monster.health).toBeLessThan(healthAfterFirstRune);
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === RUNE_ID),
    ).toMatchObject({ count: 1, version: 3 });
  });

  it("holds an area rule until the live monster count matches its comparison", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(50, "Knight"),
      position: { x: 5, y: 5, z: 7 },
      inventory: [
        ownedItem(WEAPON_ID, 3273, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
      actionBar: createDefaultActionBar(),
      actionBotSettings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        rules: [
          {
            id: "exori",
            enabled: true,
            action: {
              kind: "spell",
              spellId: "exori",
              targetMode: "self",
            },
            trigger: { kind: "target-present" },
            unequipWhenInactive: false,
            monstersAround: { comparison: "at-least", count: 3 },
          },
        ],
      },
    });
    const crowd = [
      { x: 4, y: 5, z: 7 },
      { x: 6, y: 5, z: 7 },
      { x: 5, y: 4, z: 7 },
    ].map((position, index) => {
      const monster = makeMonster(
        `monster-instance:exori-crowd:${index}`,
        position,
        makeMonsterType({ health: 2_000, maxHealth: 2_000 }),
      );
      return monster;
    });
    const [target, bystander, third] = crowd;
    if (!target || !bystander || !third) throw new Error("expected 3 monsters");
    for (const monster of [target, bystander]) {
      harness.world.addCreature(monster);
      harness.session.knownCreatureIds.add(monster.id);
    }
    harness.session.fightMode = {
      ...harness.session.fightMode,
      chase: false,
    };
    harness.combat.selectTarget(harness.session, target.id, 1_000);

    // Two monsters in the area is one short of the rule's requirement.
    harness.combat.tick(1_000);
    expect(bystander.health).toBe(bystander.maxHealth);

    harness.world.addCreature(third);
    harness.session.knownCreatureIds.add(third.id);
    harness.combat.tick(2_000);

    expect(bystander.health).toBeLessThan(bystander.maxHealth);
    expect(third.health).toBeLessThan(third.maxHealth);

    // Flipping the comparison holds the same crowd back again.
    const healthAfterCast = bystander.health;
    harness.session.actionBotSettings = {
      ...harness.session.actionBotSettings,
      rules: harness.session.actionBotSettings.rules.map((rule) => ({
        ...rule,
        monstersAround: { comparison: "at-most", count: 1 } as const,
      })),
    };
    harness.combat.tick(20_000);

    expect(bystander.health).toBe(healthAfterCast);
  });

  it("atomically equips and unequips one configured item as its trigger changes", async () => {
    const harness = await makeHarness({
      inventory: [
        ownedItem(ARMOR_ID, 3355, {
          kind: "container",
          containerId: BACKPACK_ID,
          slot: 0,
        }),
      ],
      actionBar: createDefaultActionBar(),
      actionBotSettings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        rules: [
          {
            id: "emergency-helmet",
            enabled: true,
            action: {
              kind: "item",
              itemTypeId: 3355,
              mode: "equip",
            },
            trigger: {
              kind: "resource-below",
              resource: "health",
              percent: 50,
            },
            unequipWhenInactive: true,
          },
        ],
      },
    });
    harness.player.setHealth(Math.floor(harness.player.maxHealth * 0.4));

    harness.combat.tick(1_000);
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === ARMOR_ID)?.location,
    ).toMatchObject({ kind: "equipment", slot: "helmet" });
    await settleItems(harness, 1_000);

    harness.player.setHealth(harness.player.maxHealth);
    harness.combat.tick(2_000);
    const inventory = harness.items.inventorySnapshot(PLAYER_ID)?.items;
    expect(inventory?.filter((item) => item.id === ARMOR_ID)).toHaveLength(1);
    expect(
      inventory?.find((item) => item.id === ARMOR_ID)?.location,
    ).toMatchObject({ kind: "container", containerId: BACKPACK_ID });
    await settleItems(harness, 2_000);
  });

  it("honors rule order when multiple automated potion thresholds are reached", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(80, "Knight"),
      inventory: [
        ownedItem(
          POTION_ID,
          239,
          { kind: "container", containerId: BACKPACK_ID, slot: 0 },
          2,
        ),
        ownedItem(
          MANA_POTION_ID,
          268,
          { kind: "container", containerId: BACKPACK_ID, slot: 1 },
          2,
        ),
      ],
      actionBar: createDefaultActionBar(),
      actionBotSettings: {
        ...DEFAULT_ACTION_BOT_SETTINGS,
        enabled: true,
        rules: [
          {
            id: "mana",
            enabled: true,
            action: {
              kind: "item",
              itemTypeId: 268,
              mode: "use-on-self",
            },
            trigger: {
              kind: "resource-below",
              resource: "mana",
              percent: 90,
            },
            unequipWhenInactive: false,
          },
          {
            id: "health",
            enabled: true,
            action: {
              kind: "item",
              itemTypeId: 239,
              mode: "use-on-self",
            },
            trigger: {
              kind: "resource-below",
              resource: "health",
              percent: 90,
            },
            unequipWhenInactive: false,
          },
        ],
      },
    });
    harness.player.setHealth(harness.player.maxHealth - 700);
    harness.player.spendMana(harness.player.maxMana);
    const healthBefore = harness.player.health;

    harness.combat.tick(1_000);

    expect(harness.player.mana).toBeGreaterThan(0);
    expect(harness.player.health).toBe(healthBefore);
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === MANA_POTION_ID),
    ).toMatchObject({ count: 1, version: 2 });
    expect(
      harness.items
        .inventorySnapshot(PLAYER_ID)
        ?.items.find((item) => item.id === POTION_ID),
    ).toMatchObject({ count: 2, version: 1 });
    await settleItems(harness, 1_000);
  });

  it("disconnects and poisons character persistence when an optimistic potion write fails", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(80, "Knight"),
      inventory: [
        ownedItem(POTION_ID, 239, {
          kind: "container",
          containerId: BACKPACK_ID,
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
          kind: "container",
          containerId: BACKPACK_ID,
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
    await expect(harness.store.loadForCharacter(PLAYER_ID)).resolves.toContainEqual(
      expect.objectContaining({
        id: POTION_ID,
        typeId: 284,
        count: 1,
        version: 2,
      }),
    );
  });

  it("drinks a stacked potion with a full backpack, dropping only the flask", async () => {
    const filler = Array.from({ length: 19 }, (_, index) =>
      ownedItem(
        `00000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`,
        3031,
        { kind: "container", containerId: BACKPACK_ID, slot: index + 1 },
      ),
    );
    const harness = await makeHarness({
      character: makeLeveledCharacter(130, "Sorcerer"),
      inventory: [
        ownedItem(
          MANA_POTION_ID,
          23373,
          { kind: "container", containerId: BACKPACK_ID, slot: 0 },
          5,
        ),
        ...filler,
      ],
    });
    harness.player.spendMana(harness.player.maxMana - 1);
    const manaBefore = harness.player.mana;

    harness.combat.usePotion(
      harness.session,
      {
        type: "use-potion",
        itemId: MANA_POTION_ID,
        revision: 1,
        targetPlayerId: PLAYER_ID,
      },
      1_000,
    );
    await settleItems(harness, 1_000);

    expect(harness.player.mana).toBeGreaterThanOrEqual(manaBefore + 425);
    expect(harness.player.mana).toBeLessThanOrEqual(manaBefore + 575);
    expect(harness.sent.filter((message) => message.type === "error")).toEqual(
      [],
    );
    const stored = await harness.store.loadForCharacter(PLAYER_ID);
    expect(stored).toContainEqual(
      expect.objectContaining({
        id: MANA_POTION_ID,
        typeId: 23373,
        count: 4,
        version: 2,
      }),
    );
    expect(stored.some((item) => item.typeId === 284)).toBe(false);
  });

  it("says the potion line only to observers who see the drinker", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(80, "Knight"),
      bystanderPositions: [
        { x: 2, y: 2, z: 7 },
        { x: 10, y: 10, z: 7 },
      ],
      inventory: [
        ownedItem(POTION_ID, 239, {
          kind: "container",
          containerId: BACKPACK_ID,
          slot: 0,
        }),
      ],
    });
    const [near, far] = harness.bystanders;
    if (!near || !far) throw new Error("expected two bystanders");
    // Both claim to know the drinker; only the one in view may hear him.
    near.session.knownCreatureIds.add(harness.player.id);
    far.session.knownCreatureIds.add(harness.player.id);
    harness.player.setHealth(harness.player.maxHealth - 600);

    harness.combat.usePotion(
      harness.session,
      {
        type: "use-potion",
        itemId: POTION_ID,
        revision: 1,
        targetPlayerId: harness.player.id,
      },
      1_000,
    );
    await settleItems(harness, 1_000);

    const monsterSay = expect.objectContaining({
      type: "creature-spoke",
      creatureId: harness.player.id,
      mode: "monster-say",
      text: "Aaaah...",
    });
    expect(harness.sent).toContainEqual(monsterSay);
    expect(near.sent).toContainEqual(monsterSay);
    expect(
      far.sent.filter((message) => message.type === "creature-spoke"),
    ).toEqual([]);
  });

  it("rejects out-of-range and vocation-restricted potion targets without consuming", async () => {
    const farHarness = await makeHarness({
      inventory: [
        ownedItem(POTION_ID, 266, {
          kind: "container",
          containerId: BACKPACK_ID,
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
          kind: "container",
          containerId: BACKPACK_ID,
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
    await expect(farHarness.store.loadForCharacter(PLAYER_ID)).resolves.toContainEqual(
      expect.objectContaining({ id: POTION_ID, typeId: 266, version: 1 }),
    );
    expect(
      vocationHarness.sent.some(
        (message) =>
          message.type === "error" &&
          message.code === "potion-vocation-restricted",
      ),
    ).toBe(true);
    await expect(
      vocationHarness.store.loadForCharacter(PLAYER_ID),
    ).resolves.toContainEqual(
      expect.objectContaining({ id: POTION_ID, typeId: 239, version: 1 }),
    );
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

  it("keeps the target when a bow has no ammunition so spells can still be aimed", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(40, "Paladin", 5),
      inventory: [
        ownedItem(WEAPON_ID, 3349, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
    });
    const monster = makeMonster(
      "monster-instance:no-ammo-target:0",
      { x: 3, y: 1, z: 7 },
      makeMonsterType({ health: 200, maxHealth: 200 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    harness.combat.selectTarget(harness.session, monster.id, 1_000);
    harness.combat.tick(1_000);
    harness.combat.tick(3_000);

    // Canary Player::doAttacking: a distance weapon with nothing to shoot
    // stands and waits, it neither drops the target nor punches.
    expect(harness.session.attackTargetId).toBe(monster.id);
    expect(monster.health).toBe(monster.maxHealth);
    expect(
      harness.sent.some(
        (message) =>
          message.type === "attack-target-changed" &&
          message.creatureId === null,
      ),
    ).toBe(false);
    expect(
      harness.sent.some(
        (message) =>
          message.type === "error" && message.code === "combat-action-failed",
      ),
    ).toBe(false);

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exori-san",
        target: { kind: "creature", creatureId: monster.id },
      },
      3_000,
    );
    expect(monster.health).toBeLessThan(monster.maxHealth);
    expect(harness.session.attackTargetId).toBe(monster.id);
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

  it("applies a monster's self-heal defense to itself", async () => {
    const harness = await makeHarness({});
    const monster = makeMonster(
      "monster-instance:heal-self:0",
      { x: 3, y: 1, z: 7 },
      makeMonsterType({ health: 100, maxHealth: 1_000 }),
    );
    harness.world.addCreature(monster);

    const applied = harness.combat.executeMonsterAbility(
      monster,
      null,
      {
        kind: "healing",
        intervalMs: 2_000,
        chance: 100,
        target: "self",
        range: 0,
        area: { shape: "single" },
        damageType: "healing",
        minimum: 40,
        maximum: 70,
      },
      1_000,
    );

    expect(applied).toBe(true);
    expect(monster.health).toBeGreaterThanOrEqual(140);
    expect(monster.health).toBeLessThanOrEqual(170);
  });

  it("rolls a monster's visual critical hit without inventing bonus damage", async () => {
    const harness = await makeHarness();
    const monster = makeMonster(
      "monster-instance:critical-hit:0",
      { x: 2, y: 1, z: 7 },
      makeMonsterType({
        flags: {
          ...makeMonsterType().flags,
          criticalChance: 100,
        },
      }),
    );
    harness.world.addCreature(monster);

    harness.combat.executeMonsterAbility(
      monster,
      harness.player,
      {
        kind: "damage",
        intervalMs: 1_000,
        chance: 100,
        target: "target",
        range: 2,
        area: { shape: "single" },
        damageType: "energy",
        minimum: 10,
        maximum: 10,
      },
      1_000,
    );

    expect(harness.player.health).toBe(harness.player.maxHealth - 10);
    expect(
      harness.sent.filter(
        (message) =>
          message.type === "magic-effect" && message.effectId === 173,
      ),
    ).toHaveLength(1);
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

  it("executes self-originating chains and delayed monster spell phases on the server tick", async () => {
    const harness = await makeHarness({ position: { x: 1, y: 1, z: 7 } });
    const second = new Player(
      {
        ...makeLeveledCharacter(),
        id: "00000000-0000-4000-8000-000000000031",
        displayName: "Second",
        normalizedName: "second",
      },
      { x: 4, y: 1, z: 7 },
    );
    const third = new Player(
      {
        ...makeLeveledCharacter(),
        id: "00000000-0000-4000-8000-000000000032",
        displayName: "Third",
        normalizedName: "third",
      },
      { x: 7, y: 1, z: 7 },
    );
    const attacker = makeMonster(
      "monster-instance:chain-caster:0",
      { x: 1, y: 4, z: 7 },
    );
    harness.world.addPlayer(second);
    harness.world.addPlayer(third);
    harness.world.addCreature(attacker);
    const playerHealth = harness.player.health;
    const secondHealth = second.health;
    const thirdHealth = third.health;

    harness.combat.executeMonsterAbility(
      attacker,
      third,
      {
        kind: "damage",
        intervalMs: 1_000,
        chance: 100,
        target: "self",
        range: 8,
        area: { shape: "single" },
        damageType: "energy",
        minimum: 10,
        maximum: 10,
        chain: {
          additionalTargets: 2,
          range: 3,
          backtracking: false,
          playersOnly: true,
        },
      },
      1_000,
    );
    expect(harness.player.health).toBe(playerHealth - 10);
    expect(second.health).toBe(secondHealth);
    harness.combat.tick(1_050);
    expect(second.health).toBe(secondHealth - 10);
    harness.combat.tick(1_100);
    expect(third.health).toBe(thirdHealth - 10);

    harness.combat.executeMonsterAbility(
      attacker,
      harness.player,
      {
        kind: "damage",
        intervalMs: 1_000,
        chance: 100,
        target: "target",
        range: 8,
        area: { shape: "single" },
        damageType: "ice",
        minimum: 5,
        maximum: 5,
        phases: [
          { delayMs: 1_000 },
          { delayMs: 2_000 },
        ],
      },
      2_000,
    );
    const beforePhases = harness.player.health;
    harness.combat.tick(2_999);
    expect(harness.player.health).toBe(beforePhases);
    harness.combat.tick(3_000);
    harness.combat.tick(4_000);
    expect(harness.player.health).toBe(beforePhases - 10);
  });

  it("applies imported reducers and respects monster field-walking flags", async () => {
    const harness = await makeHarness({ position: { x: 5, y: 5, z: 7 } });
    const reducer = makeMonster(
      "monster-instance:reducer:0",
      { x: 5, y: 6, z: 7 },
    );
    harness.world.addCreature(reducer);
    harness.combat.executeMonsterAbility(
      reducer,
      harness.player,
      {
        kind: "condition",
        intervalMs: 1_000,
        chance: 100,
        target: "target",
        range: 2,
        area: { shape: "single" },
        conditions: [
          {
            type: "attributes",
            durationMs: 5_000,
            attributes: {
              meleePercent: { minimum: 50, maximum: 50 },
            },
          },
        ],
      },
      1_000,
    );
    expect(harness.player.conditions.skillModifier("sword", 100)).toBe(-50);
    expect(
      harness.sent.some(
        (message) => message.type === "creature-state-changed",
      ),
    ).toBe(false);

    harness.world.combatFields.create(
      { x: 2, y: 1, z: 7 },
      "fire",
      reducer.id,
      1_000,
    );
    const blocked = makeMonster(
      "monster-instance:field-blocked:0",
      { x: 1, y: 1, z: 7 },
    );
    harness.world.addCreature(blocked);
    expect(
      harness.world.tryMoveCreature(blocked, "east", 1_000).moved,
    ).toBe(false);
    harness.world.removeCreature(blocked.id);

    const allowed = makeMonster(
      "monster-instance:field-allowed:0",
      { x: 1, y: 1, z: 7 },
      makeMonsterType({
        flags: {
          ...makeMonsterType().flags,
          canWalkOnFire: true,
        },
      }),
    );
    harness.world.addCreature(allowed);
    expect(
      harness.world.tryMoveCreature(allowed, "east", 1_000).moved,
    ).toBe(true);
  });

  it("broadcasts creature state only for visually projected conditions", async () => {
    const harness = await makeHarness();
    const source = makeMonster(
      "monster-instance:condition-state:0",
      { x: 2, y: 1, z: 7 },
    );
    harness.world.addCreature(source);

    harness.combat.executeMonsterAbility(
      source,
      harness.player,
      {
        kind: "condition",
        intervalMs: 1_000,
        chance: 100,
        target: "target",
        range: 2,
        area: { shape: "single" },
        conditionType: "outfit",
        durationMs: 5_000,
      },
      1_000,
    );

    const applied = harness.sent.flatMap((message) =>
      message.type === "creature-state-changed" &&
      message.creature.id === harness.player.id
        ? [message.creature]
        : [],
    );
    expect(applied).toHaveLength(1);
    expect(applied[0]?.outfit).toEqual(source.outfit);

    harness.combat.tick(6_000);

    const expired = harness.sent.flatMap((message) =>
      message.type === "creature-state-changed" &&
      message.creature.id === harness.player.id
        ? [message.creature]
        : [],
    );
    expect(expired).toHaveLength(2);
    expect(expired[1]?.outfit).toEqual(harness.player.outfit);
  });

  it("uses imported factions, elemental healing, and capped reflection", async () => {
    const harness = await makeHarness();
    const attacker = makeMonster(
      "monster-instance:faction-a:0",
      { x: 2, y: 2, z: 7 },
      makeMonsterType({
        id: "faction-a",
        faction: "FACTION_A",
        enemyFactions: ["FACTION_B"],
        health: 100,
        maxHealth: 100,
      }),
    );
    const target = makeMonster(
      "monster-instance:faction-b:0",
      { x: 2, y: 1, z: 7 },
      makeMonsterType({
        id: "faction-b",
        faction: "FACTION_B",
        health: 100,
        maxHealth: 100,
        reflects: { fire: 100 },
        heals: { fire: 50 },
      }),
    );
    harness.world.addCreature(attacker);
    harness.world.addCreature(target);
    target.setHealth(90);
    const fire: MonsterAbility = {
      kind: "damage",
      intervalMs: 1_000,
      chance: 100,
      target: "target",
      range: 2,
      area: { shape: "single" },
      damageType: "fire",
      minimum: 10,
      maximum: 10,
    };

    harness.combat.executeMonsterAbility(attacker, target, fire, 1_000);
    expect(target.health).toBe(85);
    expect(attacker.health).toBe(99);

    const playerHealth = harness.player.health;
    harness.combat.executeMonsterAbility(
      attacker,
      harness.player,
      fire,
      2_000,
    );
    expect(harness.player.health).toBe(playerHealth);
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
    const expectedLoss = experienceBefore / 10n;
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

  it("applies monster on-hit damage conditions only when the hit lands", async () => {
    const blocked = await makeHarness({
      inventory: [
        ownedItem(ARMOR_ID, 3355, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "helmet",
        }),
      ],
    });
    const attacker = makeMonster(
      "monster-instance:freezer:blocked",
      { x: 2, y: 1, z: 7 },
    );
    const ability: MonsterAbility = {
      kind: "damage",
      intervalMs: 1_000,
      chance: 100,
      target: "target",
      range: 2,
      area: { shape: "single" },
      damageType: "physical",
      minimum: 1,
      maximum: 1,
      conditions: [
        {
          type: "freeze",
          durationMs: 4_000,
          tickSchedule: {
            damageType: "ice",
            intervalMs: 1_000,
            amounts: [10, 5],
          },
        },
      ],
    };
    blocked.world.addCreature(attacker);

    blocked.combat.executeMonsterAbility(attacker, blocked.player, ability, 0);

    expect(blocked.player.health).toBe(blocked.player.maxHealth);
    expect(blocked.player.conditions.has("freeze")).toBe(false);

    const landed = await makeHarness();
    const landedAttacker = makeMonster(
      "monster-instance:freezer:landed",
      { x: 2, y: 1, z: 7 },
    );
    landed.world.addCreature(landedAttacker);

    landed.combat.executeMonsterAbility(
      landedAttacker,
      landed.player,
      { ...ability, minimum: 20, maximum: 20 },
      0,
    );

    expect(landed.player.health).toBeLessThan(landed.player.maxHealth);
    expect(landed.player.conditions.has("freeze")).toBe(true);
  });

  it("drops a follow whose target is forged, off-floor, or out of view", async () => {
    const harness = await makeHarness({ map: makeMap([], [], [], [7, 8]) });
    const monster = makeMonster("monster-instance:follow:0", {
      x: 3,
      y: 1,
      z: 7,
    });
    harness.world.addCreature(monster);

    // Never told about this creature: the follow must be refused outright.
    harness.combat.followCreature(harness.session, monster.id, 1_000);
    expect(harness.session.followTargetId).toBeNull();

    harness.combat.followCreature(
      harness.session,
      "monster-instance:forged:0",
      1_001,
    );
    expect(harness.session.followTargetId).toBeNull();

    harness.session.knownCreatureIds.add(monster.id);
    harness.combat.followCreature(harness.session, monster.id, 1_002);
    expect(harness.session.followTargetId).toBe(monster.id);

    // Attacking clears the follow so only one thing steers the player.
    harness.combat.selectTarget(harness.session, monster.id, 1_003);
    expect(harness.session.followTargetId).toBeNull();

    harness.combat.followCreature(harness.session, monster.id, 1_004);
    expect(harness.session.followTargetId).toBe(monster.id);

    // A target that changes floor is dropped at execution time, not followed.
    harness.world.removeCreature(monster.id);
    monster.moveTo({ x: 3, y: 1, z: 8 });
    harness.world.addCreature(monster);
    harness.combat.tick(1_005);
    expect(harness.session.followTargetId).toBeNull();
  });

  it("keeps the combat analyzer to the session's own totals", async () => {
    const harness = await makeHarness();
    const monster = makeMonster("monster-instance:analyzed:0", {
      x: 2,
      y: 1,
      z: 7,
    });
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);

    harness.player.analyzer.recordDamageDealt(25);
    harness.player.analyzer.recordDamageTaken(7);

    harness.combat.sendCombatAnalyzer(harness.session, 5_000);
    const analyzer = harness.sent
      .filter((message) => message.type === "combat-analyzer")
      .at(-1);
    if (analyzer?.type !== "combat-analyzer") {
      throw new Error("expected a combat-analyzer message");
    }

    expect(analyzer.analyzer.entries).toHaveLength(1);
    expect(analyzer.analyzer.entries[0]).toMatchObject({
      playerId: harness.player.id,
      damageDealt: 25,
      damageTaken: 7,
    });
    expect(analyzer.analyzer.elapsedMs).toBe(5_000);

    harness.combat.resetCombatAnalyzer(harness.session, 6_000);
    expect(harness.player.analyzer.damageDealt).toBe(0);
    expect(harness.player.analyzer.elapsedMs(6_000)).toBe(0);
  });

  it("only aims a direction spell at a target the session can still see", async () => {
    const harness = await makeHarness();
    const monster = makeMonster("monster-instance:aimed:0", {
      x: 1,
      y: 3,
      z: 7,
    });
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    harness.combat.selectTarget(harness.session, monster.id, 1_000);

    const exori = new SpellRegistry().get("exori");
    if (!exori) throw new Error("expected the pinned Exori definition");

    // Target due south: without opting in, the cast keeps the player's facing.
    expect(
      aimDirectionFor(harness.world, harness.session, harness.player, exori),
    ).toBeUndefined();

    harness.session.aimAtTargetSpellIds = new Set([exori.id]);
    expect(
      aimDirectionFor(harness.world, harness.session, harness.player, exori),
    ).toBe("south");

    // A target the session no longer knows falls back to the facing.
    harness.session.knownCreatureIds.delete(monster.id);
    expect(
      aimDirectionFor(harness.world, harness.session, harness.player, exori),
    ).toBeUndefined();
  });

  it("refuses aim-at-target spells the character cannot cast", async () => {
    const harness = await makeHarness();

    expect(
      harness.combat.sanitizeAimAtTargetSpells(harness.player, [
        "exori",
        "not-a-spell",
        "avalanche-rune",
        "exori",
      ]),
    ).toEqual(["exori"]);
  });

  it("challenges only live, unowned monsters and never a forged one", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(50, "Elite Knight"),
    });
    const wild = makeMonster("monster-instance:wild:0", { x: 2, y: 1, z: 7 });
    const summon = makeMonster("monster-instance:owned:0", {
      x: 1,
      y: 2,
      z: 7,
    });
    for (const monster of [wild, summon]) {
      harness.world.addCreature(monster);
      harness.session.knownCreatureIds.add(monster.id);
    }
    const challenged: string[] = [];
    harness.combat.attachTargeting({
      challengeMonster: (monster) => {
        if (monster.id === summon.id) return false;
        challenged.push(monster.id);
        return true;
      },
      pullMonsterToMelee: () => false,
      isSummon: (monster) => monster.id === summon.id,
      summonForPlayer: () => null,
      playerSummonCount: () => 0,
      findMonsterTypeByName: () => undefined,
    });
    const manaBefore = harness.player.mana;

    harness.combat.castSpell(
      harness.session,
      { type: "cast-spell", spellId: "exeta-res", target: { kind: "self" } },
      1_000,
    );

    expect(challenged).toEqual([wild.id]);
    expect(harness.player.mana).toBeLessThan(manaBefore);
  });

  /**
   * Ice Burst's Canary body is a `revelationStageWOD("Twin Burst")` gate. The
   * gate is imported as data and enforced here, at execution time, against the
   * character's own wheel bonuses — never against anything the client sends.
   */
  it("refuses a wheel-gated spell until its revelation stage is reached", async () => {
    const ungated = await makeHarness({
      character: makeLeveledCharacter(300, "Elder Druid", 30),
    });
    const manaBefore = ungated.player.mana;

    ungated.combat.castSpell(
      ungated.session,
      {
        type: "cast-spell",
        spellId: "exevo-ulus-frigo",
        target: { kind: "self" },
      },
      1_000,
    );

    expect(ungated.player.mana).toBe(manaBefore);
    expect(
      ungated.sent.some(
        (message) =>
          message.type === "error" && message.code === "spell-not-learned",
      ),
    ).toBe(true);

    const revealed = await makeHarness({
      character: makeLeveledCharacter(300, "Elder Druid", 30),
      wheelBonuses: {
        ...EMPTY_WHEEL_BONUSES,
        revelationStages: { green: 0, red: 0, blue: 1, purple: 0 },
      },
    });

    revealed.combat.castSpell(
      revealed.session,
      {
        type: "cast-spell",
        spellId: "exevo-ulus-frigo",
        target: { kind: "self" },
      },
      1_000,
    );

    expect(revealed.player.mana).toBeLessThan(revealed.player.maxMana);
    expect(
      revealed.sent.some(
        (message) =>
          message.type === "error" && message.code === "spell-not-learned",
      ),
    ).toBe(false);
  });

  /**
   * Avatars: the outfit condition and the crit/damage-reduction window come
   * from the server-owned purple stage, and the 2 h cooldown loses 30 min
   * per grade past the first (never below the half-base floor).
   */
  it("transforms an avatar cast into the outfit, buff window, and graded cooldown", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(300, "Elite Knight", 10),
      wheelBonuses: {
        ...EMPTY_WHEEL_BONUSES,
        revelationStages: { green: 0, red: 0, blue: 0, purple: 2 },
        spellGrades: { "Avatar of Steel": 2 },
      },
    });

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "uteta-res-eq",
        target: { kind: "self" },
      },
      1_000,
    );

    expect(harness.player.avatarStage).toBe(2);
    expect(harness.player.avatarUntil).toBe(16_000);
    expect(harness.player.conditions.has("outfit")).toBe(true);
    expect(
      harness.session.combatCooldowns.get("spell:uteta-res-eq")?.totalMs,
    ).toBe(5_400_000);
  });

  /**
   * Divine Grenade arms a fuse instead of dealing damage at cast time; the
   * detonation runs through the tick-owned queue and re-resolves the blast
   * against live world state.
   */
  it("detonates Divine Grenade only after its fuse through the tick queue", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(300, "Royal Paladin", 30),
      wheelBonuses: {
        ...EMPTY_WHEEL_BONUSES,
        revelationStages: { green: 0, red: 1, blue: 0, purple: 0 },
        spellGrades: { "Divine Grenade": 1 },
      },
    });
    const monster = makeMonster(
      "monster-instance:grenade-target:0",
      { x: 3, y: 1, z: 7 },
      makeMonsterType({ health: 5_000, maxHealth: 5_000 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exevo-tempo-mas-san",
        target: { kind: "creature", creatureId: monster.id },
      },
      1_000,
    );
    expect(monster.health).toBe(monster.maxHealth);

    harness.combat.tick(3_999);
    expect(monster.health).toBe(monster.maxHealth);

    harness.combat.tick(4_000);
    expect(monster.health).toBeLessThan(monster.maxHealth);
  });

  /**
   * Executioner's Throw resolves its chain hop by hop from live positions
   * and applies the red-stage execute bonus against low-health targets.
   */
  it("chains Executioner's Throw and hits the chained monster too", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(300, "Elite Knight", 10),
      inventory: [
        ownedItem(WEAPON_ID, 3273, {
          kind: "equipment",
          characterId: PLAYER_ID,
          slot: "weapon",
        }),
      ],
      wheelBonuses: {
        ...EMPTY_WHEEL_BONUSES,
        revelationStages: { green: 0, red: 1, blue: 0, purple: 0 },
        spellGrades: { "Executioner's Throw": 1 },
      },
    });
    const primary = makeMonster(
      "monster-instance:execute-target:0",
      { x: 3, y: 1, z: 7 },
      makeMonsterType({ health: 100, maxHealth: 100_000 }),
    );
    const chained = makeMonster(
      "monster-instance:execute-target:1",
      { x: 5, y: 1, z: 7 },
      makeMonsterType({ health: 50_000, maxHealth: 50_000 }),
    );
    harness.world.addCreature(primary);
    harness.world.addCreature(chained);
    harness.session.knownCreatureIds.add(primary.id);

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exori-amp-kor",
        target: { kind: "creature", creatureId: primary.id },
      },
      1_000,
    );

    expect(primary.health).toBeLessThan(100);
    expect(chained.health).toBeLessThan(chained.maxHealth);
  });

  it("applies wheel life and mana leech at damage execution time", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(300, "Elder Druid", 30),
      wheelBonuses: {
        ...EMPTY_WHEEL_BONUSES,
        revelationStages: { green: 0, red: 0, blue: 1, purple: 0 },
        lifeLeechPercent: 100,
        manaLeechPercent: 100,
      },
    });
    const monster = makeMonster(
      "monster-instance:wheel-leech:0",
      { x: 3, y: 1, z: 7 },
      makeMonsterType({ health: 100_000, maxHealth: 100_000 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    harness.player.setHealth(1);

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exevo-ulus-frigo",
        target: { kind: "self" },
      },
      1_000,
    );

    const dealt = monster.maxHealth - monster.health;
    expect(dealt).toBeGreaterThan(0);
    // 100 % leech on a single target heals the full damage dealt, and the
    // mana leg more than refunds the 230 mana the cast spent.
    expect(harness.player.health).toBe(Math.min(1 + dealt, harness.player.maxHealth));
    expect(harness.player.mana).toBe(harness.player.maxMana);
  });

  it("never leeches for a player without wheel or equipment leech", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(300, "Elder Druid", 30),
      wheelBonuses: {
        ...EMPTY_WHEEL_BONUSES,
        revelationStages: { green: 0, red: 0, blue: 1, purple: 0 },
      },
    });
    const monster = makeMonster(
      "monster-instance:wheel-leech:1",
      { x: 3, y: 1, z: 7 },
      makeMonsterType({ health: 100_000, maxHealth: 100_000 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);
    harness.player.setHealth(1);

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exevo-ulus-frigo",
        target: { kind: "self" },
      },
      1_000,
    );

    expect(monster.health).toBeLessThan(monster.maxHealth);
    expect(harness.player.health).toBe(1);
  });

  it("adds the revelation flat damage and healing to player casts", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(300, "Elder Druid", 30),
      wheelBonuses: {
        ...EMPTY_WHEEL_BONUSES,
        revelationStages: { green: 0, red: 0, blue: 1, purple: 0 },
        damageAndHealing: 500,
      },
    });
    const monster = makeMonster(
      "monster-instance:wheel-flat:0",
      { x: 3, y: 1, z: 7 },
      makeMonsterType({ health: 100_000, maxHealth: 100_000 }),
    );
    harness.world.addCreature(monster);
    harness.session.knownCreatureIds.add(monster.id);

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exevo-ulus-frigo",
        target: { kind: "self" },
      },
      1_000,
    );
    // Formula floor at level 300 / magic 30 is 270; the flat 500 rides on top.
    expect(monster.maxHealth - monster.health).toBeGreaterThanOrEqual(770);

    harness.player.setHealth(1);
    harness.combat.castSpell(
      harness.session,
      { type: "cast-spell", spellId: "exura", target: { kind: "self" } },
      3_000,
    );
    expect(harness.player.health).toBeGreaterThanOrEqual(501);
  });

  it("applies wheel augment mana cost and cooldown reductions at cast time", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(300, "Elder Druid", 30),
      bystanderPositions: [{ x: 2, y: 1, z: 7 }],
      partyMembership: { sameParty: true },
      wheelBonuses: {
        ...EMPTY_WHEEL_BONUSES,
        spellGrades: { "Heal Friend": 1, "Nature's Embrace": 2 },
      },
    });
    const friend = harness.bystanders[0];
    if (!friend) throw new Error("bystander missing");
    harness.session.knownCreatureIds.add(friend.player.id);

    const manaBefore = harness.player.mana;
    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exura-sio",
        target: { kind: "creature", creatureId: friend.player.id },
      },
      1_000,
    );
    // Heal Friend costs 120; its grade 1 augment refunds 10.
    expect(manaBefore - harness.player.mana).toBe(110);

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exura-gran-sio",
        target: { kind: "creature", creatureId: friend.player.id },
      },
      3_000,
    );
    // Nature's Embrace runs 60 s; its grade 2 augment removes 10 s.
    expect(
      harness.session.combatCooldowns.get("spell:exura-gran-sio")?.totalMs,
    ).toBe(50_000);
  });

  it("widens Energy Wave to the grade-two area from the server-owned grade", async () => {
    const castAt = async (grades: Readonly<Record<string, number>>) => {
      const harness = await makeHarness({
        character: makeLeveledCharacter(300, "Master Sorcerer", 30),
        position: { x: 5, y: 8, z: 7 },
        wheelBonuses: { ...EMPTY_WHEEL_BONUSES, spellGrades: grades },
      });
      // Offset (2,-3) from the cast center one tile ahead exists only in
      // the upgraded AREA_WAVE7 matrix.
      const monster = makeMonster(
        "monster-instance:wheel-wave:0",
        { x: 7, y: 4, z: 7 },
        makeMonsterType({ health: 100_000, maxHealth: 100_000 }),
      );
      harness.world.addCreature(monster);
      harness.session.knownCreatureIds.add(monster.id);
      harness.player.direction = "north";
      harness.combat.castSpell(
        harness.session,
        {
          type: "cast-spell",
          spellId: "exevo-vis-hur",
          target: { kind: "direction" },
        },
        1_000,
      );
      return monster;
    };

    const upgraded = await castAt({ "Energy Wave": 2 });
    expect(upgraded.health).toBeLessThan(upgraded.maxHealth);
    const base = await castAt({});
    expect(base.health).toBe(base.maxHealth);
  });

  it("self-heals the Healing Link druid when healing another player", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(300, "Elder Druid", 30),
      bystanderPositions: [{ x: 2, y: 1, z: 7 }],
      wheelBonuses: {
        ...EMPTY_WHEEL_BONUSES,
        instants: { "Healing Link": true },
      },
    });
    const friend = harness.bystanders[0];
    if (!friend) throw new Error("bystander missing");
    harness.session.knownCreatureIds.add(friend.player.id);
    harness.player.setHealth(1);

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exura-sio",
        target: { kind: "creature", creatureId: friend.player.id },
      },
      1_000,
    );

    expect(harness.player.health).toBeGreaterThan(1);
  });

  it("saves a fatal hit through Gift of Life exactly once per cooldown", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(300, "Elder Druid", 30),
      wheelBonuses: {
        ...EMPTY_WHEEL_BONUSES,
        revelationStages: { green: 1, red: 0, blue: 0, purple: 0 },
      },
    });
    const maxHealth = harness.player.maxHealth;
    harness.player.setHealth(50);

    harness.combat.applyTileTrapDamage(
      harness.player,
      { minimum: 60, maximum: 60, type: "earth" },
      1_000,
    );

    // Stage 1 heals 20 % of max health; the hit removes the pre-heal 50.
    expect(harness.player.health).toBe(Math.floor(maxHealth * 0.2));
    expect(
      harness.player.storageValue("wheel:gift-of-life-cooldown"),
    ).toBe(108_000);

    // On cooldown the same fatal hit kills; the death path revives at full.
    harness.player.setHealth(10);
    harness.combat.applyTileTrapDamage(
      harness.player,
      { minimum: 60, maximum: 60, type: "earth" },
      2_000,
    );
    expect(harness.player.health).toBe(harness.player.maxHealth);
  });

  it("lets gem dodge fully avoid incoming player damage", async () => {
    const attacked = async (dodgePercent: number) => {
      const harness = await makeHarness({
        character: makeLeveledCharacter(300, "Elder Druid", 30),
        bystanderPositions: [{ x: 2, y: 1, z: 7 }],
      });
      harness.session.fightMode.secure = false;
      const victim = harness.bystanders[0];
      if (!victim) throw new Error("bystander missing");
      harness.session.knownCreatureIds.add(victim.player.id);
      if (dodgePercent > 0) {
        victim.player.setWheelBonuses({
          ...EMPTY_WHEEL_BONUSES,
          dodgePercent,
        });
      }
      harness.combat.castSpell(
        harness.session,
        {
          type: "cast-spell",
          spellId: "exori-frigo",
          target: { kind: "creature", creatureId: victim.player.id },
        },
        1_000,
      );
      return victim.player;
    };

    const dodged = await attacked(100);
    expect(dodged.health).toBe(dodged.maxHealth);
    const struck = await attacked(0);
    expect(struck.health).toBeLessThan(struck.maxHealth);
  });

  /**
   * Balanced Brawl's target callback pulls every monster the pinned
   * AREA_BALANCED_BRAWL matrix covers into melee. The matrix is anchored on
   * the tile ahead of the caster, so the caster's own square is never in it.
   */
  it("pulls only the monsters the Balanced Brawl matrix covers", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(175, "Exalted Monk"),
      position: { x: 6, y: 8, z: 7 },
    });
    harness.player.direction = "north";
    // Two tiles north of the caster: inside the fan.
    const inside = makeMonster("monster-instance:inside:0", {
      x: 6,
      y: 6,
      z: 7,
    });
    // Directly behind the caster: the fan never reaches backwards.
    const behind = makeMonster("monster-instance:behind:0", {
      x: 6,
      y: 9,
      z: 7,
    });
    for (const monster of [inside, behind]) {
      harness.world.addCreature(monster);
      harness.session.knownCreatureIds.add(monster.id);
    }
    const pulled: string[] = [];
    harness.combat.attachTargeting({
      challengeMonster: () => false,
      pullMonsterToMelee: (monster, distance, _now, durationMs) => {
        pulled.push(`${monster.id}:${distance}:${durationMs}`);
        return true;
      },
      isSummon: () => false,
      summonForPlayer: () => null,
      playerSummonCount: () => 0,
      findMonsterTypeByName: () => undefined,
    });
    const manaBefore = harness.player.mana;

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "exori-mas-res",
        target: { kind: "direction" },
      },
      1_000,
    );

    expect(pulled).toEqual([`${inside.id}:1:16000`]);
    expect(harness.player.mana).toBe(manaBefore - 80);
  });

  it("refuses an unknown illusion name without spending mana or exhausting", async () => {
    const harness = await makeHarness({
      character: makeLeveledCharacter(50, "Master Sorcerer", 30),
    });
    harness.combat.attachTargeting({
      challengeMonster: () => false,
      pullMonsterToMelee: () => false,
      isSummon: () => false,
      summonForPlayer: () => null,
      playerSummonCount: () => 0,
      findMonsterTypeByName: (name) =>
        name.trim().toLowerCase() === "rat"
          ? makeMonsterType({ flags: { ...makeMonsterType().flags, illusionable: true } })
          : undefined,
    });
    const manaBefore = harness.player.mana;

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "utevo-res-ina",
        target: { kind: "self" },
        parameter: "not a monster",
      },
      1_000,
    );

    expect(harness.player.mana).toBe(manaBefore);
    expect(harness.player.conditions.has("outfit")).toBe(false);
    expect(
      harness.sent.some(
        (message) =>
          message.type === "error" &&
          message.code === "spell-parameter-invalid",
      ),
    ).toBe(true);

    harness.combat.castSpell(
      harness.session,
      {
        type: "cast-spell",
        spellId: "utevo-res-ina",
        target: { kind: "self" },
        parameter: "Rat",
      },
      1_100,
    );

    expect(harness.player.mana).toBeLessThan(manaBefore);
    expect(harness.player.conditions.has("outfit")).toBe(true);
  });

  it("scales damage by the server-owned dealt and received buffs", async () => {
    const harness = await makeHarness();
    const monster = makeMonster("monster-instance:buffed:0", {
      x: 2,
      y: 1,
      z: 7,
    });
    harness.world.addCreature(monster);

    const ability: MonsterAbility = {
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

    const before = harness.player.health;
    harness.combat.executeMonsterAbility(monster, harness.player, ability, 0);
    const unbuffed = before - harness.player.health;

    harness.player.setHealth(harness.player.maxHealth);
    harness.player.conditions.apply(
      {
        type: "attributes",
        sourceId: harness.player.id,
        durationMs: 10_000,
        attributes: { damageReceivedPercent: 200 },
      },
      0,
    );
    const buffedBefore = harness.player.health;
    harness.combat.executeMonsterAbility(monster, harness.player, ability, 0);
    const buffed = buffedBefore - harness.player.health;

    expect(unbuffed).toBe(40);
    expect(buffed).toBe(80);
  });

  it("starts a monster's directional wave ahead of it, not on its victim", async () => {
    const harness = await makeHarness({ position: { x: 5, y: 5, z: 7 } });
    // Four tiles north of the player, so a 3-tile wave aimed south reaches
    // the tiles between them but must not be laid out around the player.
    const caster = makeMonster("monster-instance:waver:0", {
      x: 5,
      y: 1,
      z: 7,
    });
    harness.world.addCreature(caster);
    const wave: MonsterAbility = {
      kind: "damage",
      intervalMs: 1_000,
      chance: 100,
      target: "direction",
      range: 0,
      // Canary's matrix centre plus two rows in front of it.
      area: {
        shape: "tiles",
        offsets: [
          { x: 0, y: 0 },
          { x: 0, y: -1 },
          { x: 0, y: -2 },
        ],
        directional: true,
      },
      damageType: "fire",
      minimum: 10,
      maximum: 10,
      effect: 6,
    };

    harness.combat.executeMonsterAbility(caster, harness.player, wave, 1_000);

    const tiles = harness.sent
      .filter((message) => message.type === "magic-effect")
      .map((message) =>
        message.type === "magic-effect" ? positionKey(message.position) : "",
      );

    // Anchored one tile ahead of the monster (y = 2), running toward the
    // player at y = 5 — never on the monster's own tile, never centred on
    // the player.
    expect(tiles).toContain(positionKey({ x: 5, y: 2, z: 7 }));
    expect(tiles).toContain(positionKey({ x: 5, y: 3, z: 7 }));
    expect(tiles).toContain(positionKey({ x: 5, y: 4, z: 7 }));
    expect(tiles).not.toContain(positionKey(caster.position));
    expect(tiles).not.toContain(positionKey({ x: 5, y: 6, z: 7 }));
    // The wave stops one short of the player, so it deals no damage.
    expect(harness.player.health).toBe(harness.player.maxHealth);
  });
  describe("item buttons that are neither runes nor potions", () => {
    /** Canary's stock exercise sword; carried in the backpack for these tests. */
    const EXERCISE_SWORD = 28_552;
    /** A readable letter: a plain "use" object with no target. */
    const LETTER = 3505;
    const EXERCISE_SWORD_ID = "00000000-0000-4000-8000-000000000031";
    const LETTER_ID = "00000000-0000-4000-8000-000000000032";

    function recordingHooks() {
      const calls: Array<{ kind: "use" | "useWith"; intent: unknown }> = [];
      const hooks: ItemUseHooks = {
        use: (_session, intent) => {
          calls.push({ kind: "use", intent });
          return true;
        },
        useWith: (_session, intent) => {
          calls.push({ kind: "useWith", intent });
          return true;
        },
      };
      return { calls, hooks };
    }

    it("routes a crosshair use of an exercise weapon through the server's use-with entry point", async () => {
      const { calls, hooks } = recordingHooks();
      const harness = await makeHarness({
        inventory: [
          ownedItem(EXERCISE_SWORD_ID, EXERCISE_SWORD, {
            kind: "container",
            containerId: BACKPACK_ID,
            slot: 0,
          }),
        ],
        actionBar: actionBarWith([
          {
            kind: "item",
            itemTypeId: EXERCISE_SWORD,
            mode: "use-with-crosshair",
          },
        ]),
        itemUse: hooks,
      });
      const dummyPosition = { x: 1, y: 2, z: 7 };

      harness.combat.activateActionBar(
        harness.session,
        {
          type: "activate-action-bar",
          slotIndex: 0,
          target: { kind: "position", position: dummyPosition },
        },
        1_000,
      );

      expect(calls).toEqual([
        {
          kind: "useWith",
          intent: {
            type: "use-item-with",
            itemId: EXERCISE_SWORD_ID,
            revision: 1,
            targetPosition: dummyPosition,
          },
        },
      ]);
      expect(harness.sent).toContainEqual({
        type: "action-bar-activation-result",
        slotIndex: 0,
        accepted: true,
      });
    });

    it("uses a cursor-mode item on the selected creature's tile", async () => {
      const { calls, hooks } = recordingHooks();
      const harness = await makeHarness({
        inventory: [
          ownedItem(EXERCISE_SWORD_ID, EXERCISE_SWORD, {
            kind: "container",
            containerId: BACKPACK_ID,
            slot: 0,
          }),
        ],
        actionBar: actionBarWith([
          {
            kind: "item",
            itemTypeId: EXERCISE_SWORD,
            mode: "use-at-cursor",
          },
        ]),
        itemUse: hooks,
      });
      const monster = makeMonster(
        "monster-instance:cursor-use-target:0",
        { x: 2, y: 1, z: 7 },
        makeMonsterType(),
      );
      harness.world.addCreature(monster);

      harness.combat.activateActionBar(
        harness.session,
        {
          type: "activate-action-bar",
          slotIndex: 0,
          target: { kind: "creature", creatureId: monster.id },
        },
        1_000,
      );

      expect(calls).toEqual([
        {
          kind: "useWith",
          intent: {
            type: "use-item-with",
            itemId: EXERCISE_SWORD_ID,
            revision: 1,
            targetPosition: { x: 2, y: 1, z: 7 },
          },
        },
      ]);
    });

    it("rejects a crosshair use that arrives without a target", async () => {
      const { calls, hooks } = recordingHooks();
      const harness = await makeHarness({
        inventory: [
          ownedItem(EXERCISE_SWORD_ID, EXERCISE_SWORD, {
            kind: "container",
            containerId: BACKPACK_ID,
            slot: 0,
          }),
        ],
        actionBar: actionBarWith([
          {
            kind: "item",
            itemTypeId: EXERCISE_SWORD,
            mode: "use-with-crosshair",
          },
        ]),
        itemUse: hooks,
      });

      harness.combat.activateActionBar(
        harness.session,
        { type: "activate-action-bar", slotIndex: 0 },
        1_000,
      );

      expect(calls).toEqual([]);
      expect(harness.sent).toContainEqual({
        type: "action-bar-activation-result",
        slotIndex: 0,
        accepted: false,
      });
    });

    it("routes a plain use through the server's use-item entry point", async () => {
      const { calls, hooks } = recordingHooks();
      const harness = await makeHarness({
        inventory: [
          ownedItem(LETTER_ID, LETTER, {
            kind: "container",
            containerId: BACKPACK_ID,
            slot: 0,
          }),
        ],
        actionBar: actionBarWith([
          { kind: "item", itemTypeId: LETTER, mode: "use" },
        ]),
        itemUse: hooks,
      });

      harness.combat.activateActionBar(
        harness.session,
        { type: "activate-action-bar", slotIndex: 0 },
        1_000,
      );

      expect(calls).toEqual([
        {
          kind: "use",
          intent: { type: "use-item", itemId: LETTER_ID, revision: 1 },
        },
      ]);
      expect(harness.sent).toContainEqual({
        type: "action-bar-activation-result",
        slotIndex: 0,
        accepted: true,
      });
    });

    it("opens a container button instead of using it", async () => {
      const { calls, hooks } = recordingHooks();
      const BAG_ID = "00000000-0000-4000-8000-000000000033";
      const harness = await makeHarness({
        inventory: [
          ownedItem(BAG_ID, 2853, {
            kind: "container",
            containerId: BACKPACK_ID,
            slot: 0,
          }),
        ],
        actionBar: actionBarWith([
          { kind: "item", itemTypeId: 2853, mode: "use" },
        ]),
        itemUse: hooks,
      });

      harness.combat.activateActionBar(
        harness.session,
        { type: "activate-action-bar", slotIndex: 0 },
        1_000,
      );

      expect(calls).toEqual([]);
      expect(
        harness.sent.some(
          (message) =>
            message.type === "inventory-updated" &&
            (message.inventory.containers ?? []).some(
              (container) => container.container.id === BAG_ID,
            ),
        ),
      ).toBe(true);
    });

    it("reports the button as not started when the server has no item-use routing", async () => {
      const harness = await makeHarness({
        inventory: [
          ownedItem(LETTER_ID, LETTER, {
            kind: "container",
            containerId: BACKPACK_ID,
            slot: 0,
          }),
        ],
        actionBar: actionBarWith([
          { kind: "item", itemTypeId: LETTER, mode: "use" },
        ]),
      });

      harness.combat.activateActionBar(
        harness.session,
        { type: "activate-action-bar", slotIndex: 0 },
        1_000,
      );

      expect(harness.sent).toContainEqual({
        type: "action-bar-activation-result",
        slotIndex: 0,
        accepted: false,
      });
    });
  });
});
