import { describe, expect, it, vi } from "vitest";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { gridMapData } from "../gridMapData";
import { Player } from "../Player";
import type { SessionRegistry } from "../SessionRegistry";
import { makeCharacter } from "../test/makeCharacter";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { deriveCharacterStats } from "../progression/deriveCharacterStats";
import { MemoryPvpStore } from "./MemoryPvpStore";
import { PVP_POLICY } from "./PvpPolicy";
import { PvpTracker } from "./PvpTracker";

function makePlayer(id: string, level = 8, x = 1): Player {
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
    { x, y: 1, z: 7 },
    0,
  );
}

interface Harness {
  world: World;
  tracker: PvpTracker;
  store: MemoryPvpStore;
  relations: {
    parties: Set<string>;
    guilds: Set<string>;
    wars: Set<string>;
  };
  addPlayer: (id: string, level?: number) => Player;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function makeHarness(): Harness {
  const world = new World(
    gridMapData({ name: "pvp-test", width: 12, height: 12, blocked: [] }),
    25,
  );
  const registry = {
    all: () => [],
    sessionFor: () => undefined,
  } as unknown as SessionRegistry;
  const visibility = new Visibility(world, registry);
  const persistence = {
    markDirty: vi.fn(),
  } as unknown as CharacterPersistence;
  const relations = {
    parties: new Set<string>(),
    guilds: new Set<string>(),
    wars: new Set<string>(),
  };
  const store = new MemoryPvpStore();
  const tracker = new PvpTracker(
    PVP_POLICY,
    world,
    registry,
    visibility,
    persistence,
    {
      sameParty: (a, b) => relations.parties.has(pairKey(a, b)),
      sameGuild: (a, b) => relations.guilds.has(pairKey(a, b)),
      atWar: (a, b) => relations.wars.has(pairKey(a, b)),
    },
    store,
  );
  let offset = 1;
  const addPlayer = (id: string, level = 8) => {
    const player = makePlayer(id, level, offset++);
    world.addPlayer(player);
    tracker.attach(player, [], 0);
    return player;
  };
  return { world, tracker, store, relations, addPlayer };
}

async function settle(tracker: PvpTracker): Promise<void> {
  await tracker.stop();
}

describe("PvpTracker", () => {
  it("re-checks party/guild relations at damage execution, not enqueue (stale-state bypass)", () => {
    const harness = makeHarness();
    const attacker = harness.addPlayer("attacker");
    const target = harness.addPlayer("target");
    harness.relations.parties.add(pairKey(attacker.id, target.id));

    expect(harness.tracker.onPlayerAttack(attacker, target, 1_000)).toBe("ok");
    expect(attacker.skull).toBe("none");

    // The player leaves the party and immediately attacks the ex-mate: the
    // relation is read again at this execution instant, so the white skull
    // is assigned.
    harness.relations.parties.delete(pairKey(attacker.id, target.id));
    expect(harness.tracker.onPlayerAttack(attacker, target, 2_000)).toBe("ok");
    expect(attacker.skull).toBe("white");
    expect(attacker.skullExpiresAt).toBe(2_000 + PVP_POLICY.whiteSkullDurationMs);
  });

  it("suppresses skulls for guild mates and war enemies but keeps them attackable", () => {
    const harness = makeHarness();
    const attacker = harness.addPlayer("attacker");
    const mate = harness.addPlayer("mate");
    const enemy = harness.addPlayer("enemy");
    harness.relations.guilds.add(pairKey(attacker.id, mate.id));
    harness.relations.wars.add(pairKey(attacker.id, enemy.id));

    expect(harness.tracker.onPlayerAttack(attacker, mate, 1_000)).toBe("ok");
    expect(harness.tracker.onPlayerAttack(attacker, enemy, 1_000)).toBe("ok");
    expect(attacker.skull).toBe("none");
  });

  it("applies frag, skull, and audit exactly once for a replayed death event", async () => {
    const harness = makeHarness();
    const killer = harness.addPlayer("killer");
    const victim = harness.addPlayer("victim");
    // Two prior frags bring the killer to the red threshold on this kill.
    harness.tracker.detachCharacter(killer.id);
    harness.tracker.attach(
      killer,
      [
        {
          victimCharacterId: "past-1",
          occurredAtMs: 1_000,
          unjustified: true,
          avenged: false,
        },
        {
          victimCharacterId: "past-2",
          occurredAtMs: 2_000,
          unjustified: true,
          avenged: false,
        },
      ],
      5_000,
    );

    harness.tracker.handlePlayerDeath(victim, killer.id, "death:same", 10_000);
    harness.tracker.handlePlayerDeath(victim, killer.id, "death:same", 10_000);
    await settle(harness.tracker);

    expect(killer.skull).toBe("red");
    expect(killer.skullExpiresAt).toBe(10_000 + PVP_POLICY.redSkullDurationMs);
    expect(harness.store.killRowCount()).toBe(1);
    expect(harness.store.sanctionAudits).toHaveLength(1);
    expect(harness.store.sanctionAudits[0]).toMatchObject({
      characterId: killer.id,
      skull: "red",
      deathEventId: "death:same",
    });
  });

  it("grants retaliation without a skull and makes killing the aggressor justified", async () => {
    const harness = makeHarness();
    const aggressor = harness.addPlayer("aggressor");
    const defender = harness.addPlayer("defender");

    harness.tracker.onPlayerAttack(aggressor, defender, 1_000);
    expect(aggressor.skull).toBe("white");

    // Retaliation: the defender fights back without gaining a skull.
    harness.tracker.onPlayerAttack(defender, aggressor, 2_000);
    expect(defender.skull).toBe("none");

    // Killing the aggressor is justified (the victim attacked first AND
    // carries a white skull), so the defender collects no frag.
    harness.tracker.handlePlayerDeath(aggressor, defender.id, "death:a", 3_000);
    await settle(harness.tracker);
    expect(defender.skull).toBe("none");
    expect(harness.store.killRowCount()).toBe(1);
    expect(harness.store.sanctionAudits).toHaveLength(0);
  });

  it("escalates through frag windows (3 -> red, 6 -> black) and expires on tick", () => {
    const harness = makeHarness();
    const killer = harness.addPlayer("killer");
    const victims = ["v1", "v2", "v3", "v4", "v5", "v6"].map((id) =>
      harness.addPlayer(id),
    );

    let now = 10_000;
    for (const [index, victim] of victims.entries()) {
      now += 60_000; // all kills inside the 4h day window
      harness.tracker.handlePlayerDeath(victim, killer.id, `death:${index}`, now);
      if (index === 2) {
        expect(killer.skull).toBe("red");
        expect(killer.skullExpiresAt).toBe(now + PVP_POLICY.redSkullDurationMs);
      }
    }
    expect(killer.skull).toBe("black");
    const expiresAt = now + PVP_POLICY.blackSkullDurationMs;
    expect(killer.skullExpiresAt).toBe(expiresAt);

    harness.tracker.tick(expiresAt - 1_000);
    expect(killer.skull).toBe("black");
    harness.tracker.tick(expiresAt + 1_000);
    expect(killer.skull).toBe("none");
    expect(killer.skullExpiresAt).toBeNull();
  });

  it("clears the white skull after the last aggressive act expires on tick", () => {
    const harness = makeHarness();
    const attacker = harness.addPlayer("attacker");
    const target = harness.addPlayer("target");

    harness.tracker.onPlayerAttack(attacker, target, 1_000);
    expect(attacker.skull).toBe("white");
    // A later aggression refreshes the expiry.
    harness.tracker.onPlayerAttack(attacker, target, 120_000);
    expect(attacker.skullExpiresAt).toBe(
      120_000 + PVP_POLICY.whiteSkullDurationMs,
    );

    harness.tracker.tick(120_000 + PVP_POLICY.whiteSkullDurationMs - 1);
    expect(attacker.skull).toBe("white");
    harness.tracker.tick(120_000 + PVP_POLICY.whiteSkullDurationMs + 1_000);
    expect(attacker.skull).toBe("none");
  });

  it("projects yellow and orange marks only to the involved viewer", async () => {
    const harness = makeHarness();
    const aggressor = harness.addPlayer("aggressor");
    const victim = harness.addPlayer("victim");
    const bystander = harness.addPlayer("bystander");

    harness.tracker.onPlayerAttack(aggressor, victim, 1_000);
    // The aggressor holds a white skull (public); drop it to inspect the
    // yellow projection in isolation.
    aggressor.skull = "none";
    aggressor.skullExpiresAt = null;

    const base = aggressor.toState();
    const forVictim = harness.tracker.decorateCreatureState(
      victim,
      aggressor,
      base,
    );
    const forBystander = harness.tracker.decorateCreatureState(
      bystander,
      aggressor,
      base,
    );
    expect(forVictim.skull).toBe("yellow");
    expect(forBystander.skull).toBeUndefined();

    // Unjustified kill: the victim (and only the victim) sees orange on
    // the killer for the avenge window.
    harness.tracker.handlePlayerDeath(victim, aggressor.id, "death:o", 2_000);
    await settle(harness.tracker);
    aggressor.skull = "none";
    aggressor.skullExpiresAt = null;
    harness.tracker.tick(2_000 + PVP_POLICY.combatLockMs + 1_000);
    const orangeForVictim = harness.tracker.decorateCreatureState(
      victim,
      aggressor,
      aggressor.toState(),
    );
    const orangeForBystander = harness.tracker.decorateCreatureState(
      bystander,
      aggressor,
      aggressor.toState(),
    );
    expect(orangeForVictim.skull).toBe("orange");
    expect(orangeForBystander.skull).toBeUndefined();
  });

  it("marks the reverse kill avenged so revenge is justified exactly once", async () => {
    const harness = makeHarness();
    const killer = harness.addPlayer("killer");
    const avenger = harness.addPlayer("avenger");

    harness.tracker.handlePlayerDeath(avenger, killer.id, "death:first", 1_000);
    await settle(harness.tracker);
    expect(killer.skull).toBe("none");

    // Revenge within the window is a justified-avenge: no frag for the
    // avenger, and the original kill is now avenged.
    harness.tracker.handlePlayerDeath(killer, avenger.id, "death:revenge", 5_000);
    await settle(harness.tracker);
    expect(avenger.skull).toBe("none");

    // A second kill of the same target is no longer covered by the spent
    // avenge and charges an unjustified frag.
    harness.tracker.handlePlayerDeath(killer, avenger.id, "death:again", 9_000);
    await settle(harness.tracker);
    const fragTimes = await harness.store.loadFrags(
      avenger.id,
      new Date(0),
    );
    expect(fragTimes.filter((frag) => frag.unjustified)).toHaveLength(1);
  });

  it("restores an unexpired sanction from durable frags at login", () => {
    const harness = makeHarness();
    const killer = harness.addPlayer("killer");
    const frags = [10_000, 20_000, 30_000].map((occurredAtMs, index) => ({
      victimCharacterId: `victim-${index}`,
      occurredAtMs,
      unjustified: true,
      avenged: false,
    }));
    harness.tracker.detachCharacter(killer.id);

    harness.tracker.attach(killer, frags, 60_000);
    expect(killer.skull).toBe("red");
    expect(killer.skullExpiresAt).toBe(30_000 + PVP_POLICY.redSkullDurationMs);
  });
});
