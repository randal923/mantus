import type { CreatureState } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { nextAttackTarget } from "./nextAttackTarget";

const OWN = { x: 100, y: 100, z: 7 };

function creature(
  id: string,
  kind: CreatureState["kind"],
  x: number,
  y: number,
  overrides: Partial<CreatureState> = {},
): CreatureState {
  return {
    id,
    kind,
    name: id,
    position: { x, y, z: 7 },
    positionRevision: 0,
    direction: "south",
    outfit: { lookType: 130, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
    healthPercent: 100,
    ...overrides,
  } as CreatureState;
}

const VIEW = [
  creature("rat-far", "monster", 106, 100),
  creature("player-near", "player", 101, 100),
  creature("rat-near", "monster", 101, 101),
  creature("npc", "npc", 100, 101),
  creature("wolf-mid", "monster", 103, 100),
  creature("rat-below", "monster", 101, 100, { position: { x: 101, y: 100, z: 8 } }),
  creature("dead", "monster", 102, 100, { healthPercent: 0 }),
];

describe("nextAttackTarget", () => {
  it("starts at the nearest monster, skipping players, npcs, other floors and corpses", () => {
    expect(nextAttackTarget(VIEW, OWN, null)).toBe("rat-near");
  });

  it("walks outward by distance and wraps around", () => {
    expect(nextAttackTarget(VIEW, OWN, "rat-near")).toBe("wolf-mid");
    expect(nextAttackTarget(VIEW, OWN, "wolf-mid")).toBe("rat-far");
    expect(nextAttackTarget(VIEW, OWN, "rat-far")).toBe("rat-near");
  });

  it("cycles backwards from the current target and from the far end", () => {
    expect(nextAttackTarget(VIEW, OWN, "rat-near", -1)).toBe("rat-far");
    expect(nextAttackTarget(VIEW, OWN, null, -1)).toBe("rat-far");
  });

  it("restarts at the nearest when the current target left the view", () => {
    expect(nextAttackTarget(VIEW, OWN, "gone")).toBe("rat-near");
  });

  it("returns null with nothing to attack", () => {
    expect(nextAttackTarget([VIEW[1]!, VIEW[3]!], OWN, null)).toBeNull();
    expect(nextAttackTarget([], OWN, "rat-near")).toBeNull();
  });

  it("orders equal distances by name then id so presses are stable", () => {
    const tie = [
      creature("b", "monster", 101, 100, { name: "wolf" }),
      creature("a", "monster", 100, 101, { name: "wolf" }),
      creature("c", "monster", 99, 100, { name: "rat" }),
    ];
    expect(nextAttackTarget(tie, OWN, null)).toBe("c");
    expect(nextAttackTarget(tie, OWN, "c")).toBe("a");
    expect(nextAttackTarget(tie, OWN, "a")).toBe("b");
  });
});
