import type { CreatureState, ServerMessage } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { updateVisibleCreaturesBatch } from "./updateVisibleCreaturesBatch";

const creature = {
  id: "monster-1",
  kind: "monster",
  name: "Rat",
  position: { x: 10, y: 10, z: 7 },
  positionRevision: 0,
  direction: "south",
  outfit: {
    lookType: 21,
    head: 0,
    body: 0,
    legs: 0,
    feet: 0,
    addons: 0,
  },
  healthPercent: 100,
} satisfies CreatureState;

describe("updateVisibleCreaturesBatch", () => {
  it("coalesces movement and health packets into one creature state", () => {
    const messages = [
      {
        type: "creature-moved",
        creatureId: creature.id,
        from: creature.position,
        position: { x: 11, y: 10, z: 7 },
        direction: "east",
        positionRevision: 1,
        durationMs: 100,
      },
      {
        type: "creature-health",
        creatureId: creature.id,
        healthPercent: 40,
      },
    ] satisfies ServerMessage[];

    expect(updateVisibleCreaturesBatch([creature], messages)).toEqual([
      {
        ...creature,
        position: { x: 11, y: 10, z: 7 },
        direction: "east",
        positionRevision: 1,
        healthPercent: 40,
      },
    ]);
  });

  it("ignores stale movement within the same browser frame", () => {
    const current = [{ ...creature, positionRevision: 4 }];
    const messages = [
      {
        type: "creature-moved",
        creatureId: creature.id,
        from: creature.position,
        position: { x: 9, y: 10, z: 7 },
        direction: "west",
        positionRevision: 3,
        durationMs: 100,
      },
    ] satisfies ServerMessage[];

    expect(updateVisibleCreaturesBatch(current, messages)).toBe(current);
  });
});
