import { describe, expect, it } from "vitest";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import { RETAINED_MEMORY_EVENTS } from "./CharacterProgression";
import { getExperienceForLevel } from "./getExperienceForLevel";

describe("CharacterProgression", () => {
  it("applies multi-level experience gains and rejects a replay", () => {
    const player = new Player(
      { ...makeCharacter("hero"), health: 1, mana: 0 },
      { x: 0, y: 0, z: 7 },
      0,
    );
    const experience = getExperienceForLevel(4);

    expect(player.awardExperience("kill:rat:1", Number(experience))).toEqual({
      processed: true,
      changed: true,
    });
    expect(player.level).toBe(4);
    expect(player.experience).toBe(experience);
    expect(player.maxHealth).toBe(195);
    expect(player.health).toBe(195);
    expect(player.maxMana).toBe(70);
    expect(player.mana).toBe(70);
    expect(player.capacity).toBe(475);

    expect(player.awardExperience("kill:rat:1", Number(experience))).toEqual({
      processed: false,
      changed: false,
    });
    expect(player.level).toBe(4);

    const reconnected = new Player(
      {
        ...makeCharacter("reconnected"),
        progressionEventIds: ["kill:rat:1"],
      },
      { x: 0, y: 0, z: 7 },
      10_000,
    );
    expect(
      reconnected.awardExperience("kill:rat:1", Number(experience)),
    ).toMatchObject({ processed: false, changed: false });
    expect(reconnected.level).toBe(1);
  });

  it("bounds the in-memory event queue while still deduping in-window replays", () => {
    const player = new Player(makeCharacter("hero"), { x: 0, y: 0, z: 7 }, 0);
    const total = RETAINED_MEMORY_EVENTS + 50;

    for (let i = 0; i < total; i++) {
      expect(
        player.awardExperience(`kill:rat:${i}`, 1).processed,
      ).toBe(true);
    }
    const experienceAfterAwards = player.experience;

    // One save reserves every event, then durably commits it: the queue must
    // compact down to the retained window (not grow with playtime).
    player.progression.reserveUnpersistedEvents();
    player.progression.commitPersistedEvents(total);
    expect(player.progression.sessionProgressionEvents.length).toBe(
      RETAINED_MEMORY_EVENTS,
    );

    // The most recent id is still inside the retained window: a replay is
    // deduped and cannot double-award (charter idempotency).
    expect(
      player.awardExperience(`kill:rat:${total - 1}`, 1),
    ).toEqual({ processed: false, changed: false });
    expect(player.experience).toBe(experienceAfterAwards);
  });

  it("does not drop or lose an event awarded concurrently with a commit", () => {
    const player = new Player(makeCharacter("hero"), { x: 0, y: 0, z: 7 }, 0);
    const reserved = RETAINED_MEMORY_EVENTS + 50;
    for (let i = 0; i < reserved; i++) {
      player.awardExperience(`kill:rat:${i}`, 1);
    }

    // A snapshot reserves the current events; its DB write is in flight.
    const pending = player.progression.reserveUnpersistedEvents();
    expect(pending.length).toBe(reserved);

    // A new kill lands while that save is still committing.
    expect(player.awardExperience("kill:rat:live", 1).processed).toBe(true);

    // The save commits and compacts. The concurrent award must survive both as
    // a dedupe guard and as an unreserved event for the next snapshot.
    player.progression.commitPersistedEvents(reserved);
    expect(player.awardExperience("kill:rat:live", 1)).toEqual({
      processed: false,
      changed: false,
    });
    expect(player.progression.reserveUnpersistedEvents()).toEqual([
      { id: "kill:rat:live", type: "experience" },
    ]);
  });

  it("handles multi-level skill and magic gains without duplicate awards", () => {
    const knight = new Player(
      makeCharacter("knight"),
      { x: 0, y: 0, z: 7 },
      0,
    );
    expect(
      knight.awardSkillTries("training:sword:1", "sword", 105),
    ).toMatchObject({ processed: true, changed: true });
    expect(
      knight.progression.skills.find((state) => state.skill === "sword"),
    ).toMatchObject({ level: 12, tries: 0 });
    expect(
      knight.awardSkillTries("training:sword:1", "sword", 105),
    ).toMatchObject({ processed: false, changed: false });

    const base = makeCharacter("sorcerer");
    const sorcerer = new Player(
      {
        ...base,
        vocation: "Sorcerer",
      },
      { x: 0, y: 0, z: 7 },
      0,
    );
    sorcerer.awardMagicProgress("spell:batch:1", 3_360);
    expect(sorcerer.progression.magicLevel).toBe(2);
    expect(sorcerer.progression.manaSpent).toBe(0);
    expect(
      sorcerer.awardMagicProgress("spell:batch:1", 3_360),
    ).toMatchObject({ processed: false, changed: false });
  });

  it("rejects negative, fractional, and overflow awards", () => {
    const player = new Player(
      makeCharacter("hero"),
      { x: 0, y: 0, z: 7 },
      0,
    );

    expect(() => player.awardExperience("kill:1", -1)).toThrow(
      "progression award is out of range",
    );
    expect(() => player.awardMagicProgress("spell:1", 1.5)).toThrow(
      "progression award is out of range",
    );
    expect(() =>
      player.awardSkillTries(
        "training:1",
        "sword",
        Number.MAX_SAFE_INTEGER,
      ),
    ).toThrow("progression award is out of range");
    expect(player.progression.sessionProgressionEvents).toEqual([]);
  });

  it("bounds online regeneration and never manufactures offline ticks", () => {
    const character = {
      ...makeCharacter("hero"),
      health: 100,
      mana: 0,
      soul: 0,
    };
    const player = new Player(character, { x: 0, y: 0, z: 7 }, 0);
    player.feed(120, 0);

    expect(player.tickProgression(60_000)).toBe(true);
    expect(player.health).toBe(105);
    expect(player.mana).toBe(10);
    expect(player.progression.soul).toBe(0);

    const reconnected = new Player(
      character,
      { x: 0, y: 0, z: 7 },
      60_000,
    );
    expect(reconnected.tickProgression(60_000)).toBe(false);
    expect(reconnected.health).toBe(100);
    expect(reconnected.mana).toBe(0);
  });

  it("uses promoted regeneration only after vocation promotion", () => {
    const character = {
      ...makeCharacter("mage"),
      vocation: "Sorcerer" as const,
      health: 100,
      mana: 0,
      soul: 0,
    };
    const free = new Player(character, { x: 0, y: 0, z: 7 }, 0, null);
    const promoted = new Player(
      character,
      { x: 0, y: 0, z: 7 },
      0,
      new Date(60_000),
    );
    free.feed(60, 0);
    promoted.feed(60, 0);
    promoted.promote("Master Sorcerer", 0);
    // Soul only regenerates while armed by a recent qualifying kill.
    free.armSoulRegeneration(0);
    promoted.armSoulRegeneration(0);

    free.tickProgression(6_000);
    promoted.tickProgression(6_000);
    expect(free.mana).toBe(4);
    expect(promoted.mana).toBe(6);

    free.tickProgression(15_000);
    promoted.tickProgression(15_000);
    expect(free.progression.soul).toBe(0);
    expect(promoted.progression.soul).toBe(1);
    expect(promoted.vocation).toBe("Master Sorcerer");
    expect(promoted.progression.maxSoul).toBe(200);
  });

  it("does not tie vocation regeneration to premium expiration", () => {
    const player = new Player(
      {
        ...makeCharacter("expiring-mage"),
        vocation: "Sorcerer",
        health: 100,
        mana: 0,
      },
      { x: 0, y: 0, z: 7 },
      0,
      new Date(10_000),
    );
    player.feed(60, 0);

    player.tickProgression(6_000);
    expect(player.mana).toBe(4);
    player.tickProgression(10_000);
    expect(player.mana).toBe(6);
    player.tickProgression(12_999);
    expect(player.mana).toBe(8);
    player.tickProgression(13_000);
    expect(player.mana).toBe(8);
  });

  it("uses Canary food fullness and extends online regeneration", () => {
    const player = new Player(
      { ...makeCharacter("hero"), health: 100, mana: 0 },
      { x: 0, y: 0, z: 7 },
      0,
    );

    player.feed(1_130, 0);
    expect(player.canFeed(69, 0)).toBe(true);
    expect(player.canFeed(70, 0)).toBe(false);
    player.feed(69, 0);

    expect(player.conditions.remainingMs("regeneration", 0)).toBe(1_199_000);
    expect(player.tickProgression(6_000)).toBe(true);
    expect(player.health).toBe(101);
    expect(player.mana).toBe(2);
  });

  it("applies the death penalty once, levels down, and clamps derived stats", () => {
    const player = new Player(
      makeCharacter("victim"),
      { x: 0, y: 0, z: 7 },
      0,
    );
    player.awardExperience("kill:boss:1", Number(getExperienceForLevel(8)));
    expect(player.level).toBe(8);
    const experienceBefore = player.experience;
    const expectedLoss = experienceBefore / 10n;

    expect(player.applyDeathPenalty("player-death:1")).toMatchObject({
      lostExperience: expectedLoss,
    });
    expect(player.experience).toBe(experienceBefore - expectedLoss);
    expect(player.level).toBeLessThan(8);
    expect(player.maxHealth).toBe(player.progression.maxHealth);
    expect(player.mana).toBeLessThanOrEqual(player.maxMana);

    expect(player.applyDeathPenalty("player-death:1")).toMatchObject({
      lostExperience: 0n,
    });
    expect(player.experience).toBe(experienceBefore - expectedLoss);
  });

  it("cannot reapply a persisted death penalty after reconnect and never goes negative", () => {
    const player = new Player(
      makeCharacter("victim"),
      { x: 0, y: 0, z: 7 },
      0,
    );
    expect(player.applyDeathPenalty("player-death:broke")).toMatchObject({
      lostExperience: 0n,
    });
    expect(player.experience).toBe(0n);
    expect(player.level).toBe(1);

    const reconnected = new Player(
      {
        ...makeCharacter("reconnected"),
        progressionEventIds: ["player-death:2"],
      },
      { x: 0, y: 0, z: 7 },
      0,
    );
    reconnected.awardExperience(
      "kill:boss:2",
      Number(getExperienceForLevel(8)),
    );
    const experienceBefore = reconnected.experience;
    expect(reconnected.applyDeathPenalty("player-death:2")).toMatchObject({
      lostExperience: 0n,
    });
    expect(reconnected.experience).toBe(experienceBefore);
  });

  it("regenerates stamina from the offline span at login, not on reconnect", () => {
    // Logged out at t=0 holding 2000 stamina; log in 780 real seconds later.
    const base = {
      ...makeCharacter("hunter"),
      stamina: 2_000,
      lastSeenAt: new Date(0),
    };
    const rested = new Player(base, { x: 0, y: 0, z: 7 }, 780_000);
    expect(rested.stamina).toBe(2_001);

    // An instant reconnect (offline span ~0) manufactures no stamina.
    const reconnected = new Player(
      { ...base, lastSeenAt: new Date(780_000) },
      { x: 0, y: 0, z: 7 },
      781_000,
    );
    expect(reconnected.stamina).toBe(2_000);
  });

  it("decays hunting stamina and reports the premium experience multiplier", () => {
    const player = new Player(
      { ...makeCharacter("hunter"), stamina: 2_400 },
      { x: 0, y: 0, z: 7 },
      0,
      new Date(9_999_999_999_999),
    );
    expect(player.staminaExperienceMultiplier(0)).toBe(1.5);
    // First hunt after login removes two stamina (Canary seed).
    expect(player.decayHuntStamina(1_000_000)).toBe(true);
    expect(player.stamina).toBe(2_398);
  });

  it("suspends soul regeneration inside a protection zone and after expiry", () => {
    const character = {
      ...makeCharacter("mage"),
      vocation: "Master Sorcerer" as const,
      soul: 0,
      mana: 0,
      health: 100,
    };
    const player = new Player(character, { x: 0, y: 0, z: 7 }, 0);
    player.armSoulRegeneration(0);

    // Armed, but inside a protection zone: no soul regeneration.
    player.tickProgression(15_000, true);
    expect(player.progression.soul).toBe(0);

    // Outside the zone and still armed: regenerates (15s interval, promoted).
    player.tickProgression(30_000, false);
    expect(player.progression.soul).toBe(1);

    // Past the 4-minute eligibility window: regeneration stops again.
    player.tickProgression(400_000, false);
    expect(player.progression.soul).toBe(1);
  });

  it("gates protection-zone regeneration on the daily reward streak", () => {
    // Master Sorcerer: mana 2 per 2s. Fed, so natural regeneration is allowed
    // and only the resting-area rules decide what happens inside the zone.
    const character = {
      ...makeCharacter("mage"),
      vocation: "Master Sorcerer" as const,
      mana: 0,
    };
    const restless = new Player(character, { x: 0, y: 0, z: 7 }, 0);
    restless.feed(600, 0);

    // Streak 0 in a protection zone: Canary blocks the regeneration outright.
    restless.tickProgression(10_000, true);
    expect(restless.progression.mana).toBe(0);
    // Same player, same span, outside the zone: unaffected by the streak.
    restless.tickProgression(20_000, false);
    expect(restless.progression.mana).toBeGreaterThan(0);

    // Streak 3 unlocks mana regeneration inside the zone.
    const rested = new Player(character, { x: 0, y: 0, z: 7 }, 0);
    rested.feed(600, 0);
    rested.setDailyStreakLevel(3);
    rested.tickProgression(10_000, true);
    expect(rested.progression.mana).toBe(10);

    // Streak 6 doubles it over the same span.
    const doubled = new Player(character, { x: 0, y: 0, z: 7 }, 0);
    doubled.feed(600, 0);
    doubled.setDailyStreakLevel(6);
    doubled.tickProgression(10_000, true);
    expect(doubled.progression.mana).toBe(20);
  });

  it("doubles resting health regeneration and rests soul at streak 7", () => {
    const character = {
      ...makeCharacter("mage"),
      vocation: "Master Sorcerer" as const,
      soul: 0,
      health: 1,
    };
    // Health is 1 per 12s; over 60s that is 5, doubled to 10 at streak 5.
    const doubled = new Player(character, { x: 0, y: 0, z: 7 }, 0);
    doubled.feed(600, 0);
    doubled.setDailyStreakLevel(5);
    doubled.tickProgression(60_000, true);
    expect(doubled.health).toBe(11);

    // Streak 7 rests soul in the zone without a recent kill arming it, which
    // is the only way soul regenerates inside a protection zone at all.
    const soulRested = new Player(character, { x: 0, y: 0, z: 7 }, 0);
    soulRested.setDailyStreakLevel(7);
    soulRested.tickProgression(15_000, true);
    expect(soulRested.progression.soul).toBe(1);

    // One level short: still nothing, armed or not.
    const unrested = new Player(character, { x: 0, y: 0, z: 7 }, 0);
    unrested.setDailyStreakLevel(6);
    unrested.armSoulRegeneration(0);
    unrested.tickProgression(15_000, true);
    expect(unrested.progression.soul).toBe(0);
  });

  it("refills stamina only while the streak-4 bonus keeps resting", () => {
    const character = {
      ...makeCharacter("rester"),
      vocation: "Elder Druid" as const,
      stamina: 2_000,
    };
    const player = new Player(character, { x: 0, y: 0, z: 7 }, 0);
    player.setDailyStreakLevel(4);

    // The first interval only starts the clock; nothing is banked yet.
    player.tickProgression(1_000, true);
    expect(player.stamina).toBe(2_000);
    player.tickProgression(181_000, true);
    expect(player.stamina).toBe(2_001);

    // Stepping out parks the timer, so the next tick inside starts over
    // instead of paying for the time spent hunting.
    player.tickProgression(200_000, false);
    player.tickProgression(370_000, true);
    expect(player.stamina).toBe(2_001);

    // Below the threshold the bonus never runs at all.
    const unrested = new Player(character, { x: 0, y: 0, z: 7 }, 0);
    unrested.setDailyStreakLevel(3);
    unrested.tickProgression(1_000, true);
    unrested.tickProgression(400_000, true);
    expect(unrested.stamina).toBe(2_000);
  });

  it("bounds scheduled training work and drops schedules on reconnect", () => {
    const character = makeCharacter("hero");
    const player = new Player(character, { x: 0, y: 0, z: 7 }, 0);
    player.progression.startTraining({
      id: "trainer:sword",
      skill: "sword",
      intervalMs: 250,
      tries: 1,
      now: 0,
    });

    expect(player.tickProgression(5_000)).toBe(true);
    expect(
      player.progression.skills.find((state) => state.skill === "sword"),
    ).toMatchObject({ level: 10, tries: 5 });

    const reconnected = new Player(
      character,
      { x: 0, y: 0, z: 7 },
      5_000,
    );
    expect(reconnected.tickProgression(10_000)).toBe(false);
    expect(
      reconnected.progression.skills.find((state) => state.skill === "sword"),
    ).toMatchObject({ level: 10, tries: 0 });
  });

  it("folds equipment modifiers into derived stats with change detection", () => {
    const player = new Player(makeCharacter("hero"), { x: 0, y: 0, z: 7 }, 0);
    const baseCapacity = player.capacity;
    const baseSpeed = player.stepSpeed;

    expect(
      player.progression.setEquipmentModifier({ speed: 0, capacityPercentOfBase: 0 }),
    ).toBe(false);
    expect(
      player.progression.setEquipmentModifier({
        speed: 15,
        capacityPercentOfBase: 9,
      }),
    ).toBe(true);
    expect(player.capacity).toBe(
      baseCapacity + Math.floor((baseCapacity * 9) / 100),
    );
    expect(player.stepSpeed).toBe(baseSpeed + 15);

    expect(
      player.progression.setEquipmentModifier({
        speed: 15,
        capacityPercentOfBase: 9,
      }),
    ).toBe(false);
    expect(
      player.progression.setEquipmentModifier({ speed: 0, capacityPercentOfBase: 0 }),
    ).toBe(true);
    expect(player.capacity).toBe(baseCapacity);
    expect(player.stepSpeed).toBe(baseSpeed);
  });
});
