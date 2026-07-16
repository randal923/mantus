import { describe, expect, it } from "vitest";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import { getExperienceForLevel } from "./getExperienceForLevel";

describe("CharacterProgression", () => {
  it("applies multi-level experience gains and rejects a replay", () => {
    const player = new Player(
      { ...makeCharacter("hero"), health: 1, mana: 0 },
      { x: 0, y: 0, z: 7 },
      0,
    );
    const experience = getExperienceForLevel(4);

    expect(player.awardExperience("kill:rat:1", experience)).toEqual({
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

    expect(player.awardExperience("kill:rat:1", experience)).toEqual({
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
      reconnected.awardExperience("kill:rat:1", experience),
    ).toMatchObject({ processed: false, changed: false });
    expect(reconnected.level).toBe(1);
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
});
