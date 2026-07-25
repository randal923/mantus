import { describe, expect, it } from "vitest";
import { LingeringPlayers } from "./LingeringPlayers";
import { Player } from "./Player";
import { makeCharacter } from "./test/makeCharacter";

const COMBAT_LOCK_MS = 60_000;

function makeFighter(characterId: string, now: number): Player {
  const player = new Player(makeCharacter(characterId), { x: 1, y: 1, z: 7 }, now);
  player.conditions.apply(
    { type: "combat-lock", sourceId: null, durationMs: COMBAT_LOCK_MS },
    now,
  );
  player.conditions.apply(
    { type: "pz-lock", sourceId: null, durationMs: COMBAT_LOCK_MS },
    now,
  );
  return player;
}

describe("LingeringPlayers", () => {
  it("keeps an in-fight character until the combat lock expires", () => {
    const lingering = new LingeringPlayers();
    const player = makeFighter("killer", 1_000);
    lingering.add(player);

    expect(lingering.has("killer")).toBe(true);
    expect(lingering.due(1_000 + COMBAT_LOCK_MS - 1, () => true)).toEqual([]);
    expect(lingering.due(1_000 + COMBAT_LOCK_MS, () => true)).toEqual([player]);
    // The entry is consumed by the sweep, so the leave path runs once.
    expect(lingering.has("killer")).toBe(false);
  });

  it("closes the window as soon as the lingering character dies", () => {
    const lingering = new LingeringPlayers();
    const player = makeFighter("victim", 1_000);
    lingering.add(player);
    player.setHealth(0);

    expect(lingering.due(2_000, () => true)).toEqual([player]);
  });

  it("closes the window when the entity already left the world", () => {
    const lingering = new LingeringPlayers();
    const player = makeFighter("ghost", 1_000);
    lingering.add(player);

    expect(lingering.due(2_000, () => false)).toEqual([player]);
  });

  it("hands the remaining combat locks to a reconnecting character", () => {
    const lingering = new LingeringPlayers();
    lingering.add(makeFighter("killer", 1_000));

    const carried = lingering.retire("killer", 31_000);

    // 30 s of the 60 s lock had elapsed, so 30 s carry over — relogging
    // neither clears the lock nor lifts the protection-zone block.
    expect(carried).toEqual({ combatLockMs: 30_000, pzLockMs: 30_000 });
    expect(lingering.has("killer")).toBe(false);
  });

  it("reports nothing to carry for a character that never lingered", () => {
    expect(new LingeringPlayers().retire("stranger", 1_000)).toBeNull();
  });

  it("tracks several lingering characters independently", () => {
    const lingering = new LingeringPlayers();
    lingering.add(makeFighter("early", 1_000));
    lingering.add(makeFighter("late", 40_000));

    expect(
      lingering.due(1_000 + COMBAT_LOCK_MS, () => true).map((p) => p.id),
    ).toEqual(["early"]);
    expect(lingering.size).toBe(1);
    expect(lingering.has("late")).toBe(true);
  });
});
