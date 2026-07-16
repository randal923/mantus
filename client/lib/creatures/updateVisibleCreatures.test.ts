import { describe, expect, it } from "vitest";
import type { CreatureState, ServerMessage } from "@tibia/protocol";
import { updateVisibleCreatures } from "./updateVisibleCreatures";

const creature: CreatureState = {
  id: "monster-instance:test:0",
  kind: "monster",
  name: "Rat",
  position: { x: 1, y: 1, z: 7 },
  positionRevision: 0,
  direction: "south",
  outfit: { lookType: 21, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
  healthPercent: 65,
};

describe("updateVisibleCreatures", () => {
  it("adds and removes only ids introduced by visibility deltas", () => {
    const joined = updateVisibleCreatures([], {
      type: "creature-joined",
      creature,
    });
    const left = updateVisibleCreatures(joined, {
      type: "creature-left",
      creatureId: creature.id,
    });

    expect(joined).toEqual([creature]);
    expect(left).toEqual([]);
  });

  it("ignores stale movement revisions", () => {
    const current = [{ ...creature, positionRevision: 2 }];
    const next = updateVisibleCreatures(current, {
      type: "creature-moved",
      creatureId: creature.id,
      from: creature.position,
      position: { x: 2, y: 1, z: 7 },
      direction: "east",
      positionRevision: 1,
      durationMs: 100,
    } satisfies ServerMessage);

    expect(next).toEqual(current);
  });
});
