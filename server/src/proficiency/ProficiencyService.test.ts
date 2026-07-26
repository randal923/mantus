import { describe, expect, it } from "vitest";
import type { ProficiencyStateMessage, ServerMessage } from "@tibia/protocol";
import type {
  BestiaryCatalog,
  BestiaryCatalogEntry,
  BossCatalogEntry,
} from "../bestiary/BestiaryCatalog";
import { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import type { Item } from "../item/Item";
import { ItemCatalog } from "../item/ItemCatalog";
import type { ItemType } from "../item/ItemType";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import { AnimusService } from "./AnimusService";
import { MemoryProficiencyStore } from "./MemoryProficiencyStore";
import type { ProficiencyCatalog } from "./ProficiencyCatalog";
import { proficiencyPerkEffects } from "./ProficiencyPerkEffects";
import { ProficiencyService } from "./ProficiencyService";

const A = "00000000-0000-4000-8000-00000000000a";

function makeMonsterType(raceIndex: number): MonsterType {
  return {
    id: `beast-${raceIndex}`,
    name: `Beast ${raceIndex}`,
    description: "beast",
    outfit: { lookType: 100, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
    health: 100,
    maxHealth: 100,
    speed: 80,
    manaCost: 0,
    changeTarget: { intervalMs: 4_000, chance: 0 },
    light: { intensity: 0, color: 0 },
    experience: 50,
    corpseItemTypeId: 5964,
    race: "blood",
    faction: "default",
    enemyFactions: [],
    flags: {
      attackable: true,
      hostile: true,
      pushable: false,
      summonable: false,
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
  };
}

function makeBestiary(): BestiaryCatalog {
  const entriesByRaceId = new Map<number, BestiaryCatalogEntry>();
  const bossesByRaceId = new Map<number, BossCatalogEntry>();
  const raceIdByMonsterTypeId = new Map<string, number>();
  const threeStar = makeMonsterType(1);
  entriesByRaceId.set(1, {
    raceId: 1,
    className: "Mammal",
    stars: 3,
    occurrence: 0,
    charmPoints: 5,
    firstUnlock: 10,
    secondUnlock: 100,
    toKill: 250,
    locations: "",
    preyExclusive: false,
    monsterType: threeStar,
  });
  raceIdByMonsterTypeId.set(threeStar.id, 1);
  const archfoe = makeMonsterType(901);
  bossesByRaceId.set(901, { raceId: 901, category: "archfoe", monsterType: archfoe });
  raceIdByMonsterTypeId.set(archfoe.id, 901);
  return { entriesByRaceId, bossesByRaceId, raceIdByMonsterTypeId };
}

const SWORD_TYPE: ItemType = {
  id: 3273,
  clientId: 3273,
  name: "sabre",
  spriteId: 1,
  stackable: false,
  maxCount: 1,
  weight: 100,
  pickupable: true,
  movable: true,
  weaponType: "sword",
  proficiencyId: 6,
  light: { intensity: 0, color: 0 },
  elevation: 0,
  render: {
    ground: false,
    groundBorder: false,
    onBottom: false,
    onTop: false,
    stackable: false,
    fluidContainer: false,
    splash: false,
    hangable: false,
    hookSouth: false,
    hookEast: false,
    lyingCorpse: false,
    animateAlways: false,
    topEffect: false,
  },
};

const CATALOG: ProficiencyCatalog = {
  profiles: new Map([
    [
      6,
      {
        proficiencyId: 6,
        name: "Sanguine 1H Sword",
        levels: [
          { perks: [{ type: "skill-bonus", value: 1, skill: "sword" }] },
          {
            perks: [
              { type: "auto-attack-critical-extra-damage", value: 0.1 },
              { type: "life-leech", value: 0.03 },
            ],
          },
        ],
      },
    ],
  ]),
};

function makeHarness(equippedWeapon = true) {
  const sessions = new Map<string, Session>();
  const sent: ServerMessage[] = [];
  const session = {
    id: `session-${A}`,
    playerId: A,
    send: (message: ServerMessage) => sent.push(message),
  } as unknown as Session;
  sessions.set(A, session);
  const registry = {
    all: () => sessions.values(),
    sessionFor: (playerId: string) => sessions.get(playerId),
  } as unknown as SessionRegistry;
  const weapon: Item = {
    id: "00000000-0000-4000-8000-000000000201",
    typeId: 3273,
    count: 1,
    attributes: {},
    version: 1,
    location: { kind: "equipment", characterId: A, slot: "weapon" },
  };
  const items = {
    combatEquipment: () =>
      equippedWeapon ? [{ item: weapon, type: SWORD_TYPE }] : [],
  } as unknown as ItemIntentHandler;
  const store = new MemoryProficiencyStore();
  const service = new ProficiencyService(
    registry,
    items,
    new ItemCatalog([SWORD_TYPE]),
    makeBestiary(),
    CATALOG,
    store,
  );
  service.attachCharacter(session, A);
  return {
    session,
    sent,
    store,
    service,
    registry,
    async flush(now = 1_000) {
      for (let round = 0; round < 4; round += 1) {
        await service.stop();
        service.applyResolvedOutcomes(now);
      }
    },
  };
}

function monsterOf(catalog: BestiaryCatalog, raceId: number): Monster {
  const type =
    catalog.entriesByRaceId.get(raceId)?.monsterType ??
    catalog.bossesByRaceId.get(raceId)?.monsterType;
  if (!type) throw new Error("missing type");
  const monster = new Monster({
    id: `monster-${raceId}`,
    type,
    position: { x: 1, y: 1, z: 7 },
    direction: "south",
    home: { x: 1, y: 1, z: 7 },
    spawnRadius: 3,
  });
  monster.recordPlayerDamage(A, 50);
  return monster;
}

const lastState = (sent: ServerMessage[]) =>
  sent
    .filter(
      (message): message is ProficiencyStateMessage =>
        message.type === "proficiency-state",
    )
    .at(-1);

describe("ProficiencyService (Feature 82)", () => {
  it("accrues killer-only experience from server kill events with Canary's tables", async () => {
    const harness = makeHarness();
    await harness.flush();
    const bestiary = makeBestiary();
    // A 3-star kill grants round(100 * 0.33) = 33.
    harness.service.onMonsterKilled(monsterOf(bestiary, 1), 1_000);
    // An archfoe kill grants round(5000 * 0.33) = 1650 boss experience.
    harness.service.onMonsterKilled(monsterOf(bestiary, 901), 2_000);
    const state = lastState(harness.sent);
    expect(state?.weapons[0]).toMatchObject({
      proficiencyId: 6,
      experience: 33 + 1_650,
    });
  });

  it("gains nothing without a wielded proficiency weapon", async () => {
    const harness = makeHarness(false);
    await harness.flush();
    harness.service.onMonsterKilled(monsterOf(makeBestiary(), 1), 1_000);
    expect(lastState(harness.sent)?.weapons ?? []).toHaveLength(0);
  });

  it("validates perk selections against earned progress at execution", async () => {
    const harness = makeHarness();
    await harness.flush();
    // No experience yet: level 0 is locked (first unlock needs 1750).
    harness.service.handleSelect(
      harness.session,
      {
        type: "proficiency-select",
        proficiencyId: 6,
        selections: [{ level: 0, index: 0 }],
      },
      1_000,
    );
    expect(harness.sent.at(-1)).toMatchObject({
      type: "proficiency-action-failed",
      reason: "level-locked",
    });
    // Earn past the first standard threshold (1750): 54 three-star kills.
    const bestiary = makeBestiary();
    for (let kill = 0; kill < 54; kill += 1) {
      harness.service.onMonsterKilled(monsterOf(bestiary, 1), 2_000 + kill);
    }
    expect(lastState(harness.sent)?.weapons[0]?.unlockedLevels).toBe(1);
    harness.service.handleSelect(
      harness.session,
      {
        type: "proficiency-select",
        proficiencyId: 6,
        selections: [{ level: 0, index: 0 }],
      },
      60_000,
    );
    expect(lastState(harness.sent)?.weapons[0]?.selections).toEqual([
      { level: 0, index: 0 },
    ]);
    // An out-of-range perk index is refused outright.
    harness.service.handleSelect(
      harness.session,
      {
        type: "proficiency-select",
        proficiencyId: 6,
        selections: [{ level: 0, index: 5 }],
      },
      61_000,
    );
    expect(harness.sent.at(-1)).toMatchObject({
      type: "proficiency-action-failed",
      reason: "invalid-perk",
    });
  });

  it("feeds only unlocked selected perks into the combat effects", async () => {
    const harness = makeHarness();
    await harness.flush();
    const bestiary = makeBestiary();
    for (let kill = 0; kill < 54; kill += 1) {
      harness.service.onMonsterKilled(monsterOf(bestiary, 1), 1_000 + kill);
    }
    harness.service.handleSelect(
      harness.session,
      {
        type: "proficiency-select",
        proficiencyId: 6,
        selections: [{ level: 0, index: 0 }],
      },
      60_000,
    );
    const effects = harness.service.effectsFor(A);
    expect(effects.skills.sword).toBe(1);
    expect(effects.lifeLeechPercent).toBe(0);
  });
});

describe("proficiencyPerkEffects", () => {
  it("converts fraction chances to percent and folds flat values", () => {
    const effects = proficiencyPerkEffects([
      { type: "attack-damage", value: 1 },
      { type: "critical-hit-chance", value: 0.02 },
      { type: "life-leech", value: 0.03 },
      { type: "powerful-foe-bonus", value: 0.03 },
      { type: "skill-bonus", value: 2, skill: "sword" },
      { type: "skill-bonus", value: 1, skill: "magic" },
    ]);
    expect(effects.attackDamage).toBe(1);
    expect(effects.criticalChancePercent).toBeCloseTo(2, 10);
    expect(effects.lifeLeechPercent).toBeCloseTo(3, 10);
    expect(effects.powerfulFoePercent).toBeCloseTo(3, 10);
    expect(effects.skills.sword).toBe(2);
    expect(effects.magicLevel).toBe(1);
  });
});

describe("AnimusService (Feature 82)", () => {
  it("applies Canary's multiplier only to mastered races, composed from the count", async () => {
    const sessions = new Map<string, Session>();
    const sent: ServerMessage[] = [];
    const session = {
      id: `session-${A}`,
      playerId: A,
      send: (message: ServerMessage) => sent.push(message),
    } as unknown as Session;
    sessions.set(A, session);
    const registry = {
      all: () => sessions.values(),
      sessionFor: (playerId: string) => sessions.get(playerId),
    } as unknown as SessionRegistry;
    const bestiary = makeBestiary();
    const store = new MemoryProficiencyStore();
    const service = new AnimusService(registry, bestiary, store);
    service.attachCharacter(session, A);
    for (let round = 0; round < 4; round += 1) {
      await service.stop();
      service.applyResolvedOutcomes(1_000);
    }
    expect(service.grant(A, 1)).toBe(true);
    expect(service.grant(A, 1)).toBe(false);
    // Unknown race: refused.
    expect(service.grant(A, 999)).toBe(false);
    const mastered = monsterOf(bestiary, 1);
    const other = monsterOf(bestiary, 901);
    // One mastery: min(4, 1 + (2 + 0*0.1)/100) = 1.02.
    expect(service.multiplierFor(A, mastered)).toBeCloseTo(1.02, 10);
    expect(service.multiplierFor(A, other)).toBe(1);
    const state = sent.filter((message) => message.type === "animus-state").at(-1);
    expect(state).toMatchObject({ raceIds: [1], bonusTenthsPercent: 20 });
  });
});
