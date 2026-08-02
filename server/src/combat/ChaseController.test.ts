import { describe, expect, it } from "vitest";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { Creature } from "../creature/Creature";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { ChaseController } from "./ChaseController";

const visibility = {
  onPlayerStepped: () => undefined,
  broadcastPose: () => undefined,
} as unknown as Visibility;

const persistence = {
  markDirty: () => undefined,
} as unknown as CharacterPersistence;

function makePlayer(position: { x: number; y: number; z: number }) {
  return { position, nextStepAt: 0 } as unknown as Player;
}

function makeSession(id = "session-1") {
  return { id, movementDirection: null, fightMode: { chase: false } } as unknown as Session;
}

/**
 * Open ground except for the given wall tiles. Records every pathability
 * probe so tests can tell whether a search ran, and every step the chase
 * actually takes.
 */
function makeWorld(blocked: (x: number, y: number) => boolean) {
  let probes = 0;
  const steps: string[] = [];
  const world = {
    isPathable: (position: { x: number; y: number }) => {
      probes++;
      return !blocked(position.x, position.y);
    },
    isOccupied: () => false,
    tryMoveCreature: (player: Player, direction: string) => {
      steps.push(direction);
      return {
        moved: true,
        turned: false,
        from: { ...player.position },
        durationMs: 100,
      };
    },
  } as unknown as World;
  return { world, steps, probes: () => probes };
}

describe("ChaseController", () => {
  it("finds a long detour around a wall the old 32-node budget never could", () => {
    // A wall on x=5 spanning y -13..5 forces a ~22-step detour to reach a
    // target 10 tiles east; breadth-first search needs a few hundred visits.
    const { world, steps } = makeWorld((x, y) => x === 5 && y >= -13 && y <= 5);
    const chase = new ChaseController(world, visibility, persistence);
    const player = makePlayer({ x: 0, y: 0, z: 7 });
    const target = { position: { x: 10, y: 0, z: 7 } } as unknown as Creature;

    chase.chaseTarget(makeSession(), player, target, 1_000, 1, true);

    expect(steps).toHaveLength(1);
  });

  it("does not chase a target outside the ±12 search box", () => {
    const { world, steps } = makeWorld(() => false);
    const chase = new ChaseController(world, visibility, persistence);
    const player = makePlayer({ x: 0, y: 0, z: 7 });
    const target = { position: { x: 15, y: 0, z: 7 } } as unknown as Creature;

    chase.chaseTarget(makeSession(), player, target, 1_000, 1, true);

    expect(steps).toHaveLength(0);
  });

  it("stands down after a failed search instead of re-searching every tick", () => {
    const { world, steps, probes } = makeWorld(() => false);
    const chase = new ChaseController(world, visibility, persistence);
    const player = makePlayer({ x: 0, y: 0, z: 7 });
    const target = { position: { x: 15, y: 0, z: 7 } } as unknown as Creature;
    const session = makeSession();

    chase.chaseTarget(session, player, target, 1_000, 1, true);
    const probesAfterFailure = probes();
    expect(probesAfterFailure).toBeGreaterThan(0);

    // Inside the cooldown nothing is probed again; after it, the search runs.
    chase.chaseTarget(session, player, target, 1_100, 1, true);
    expect(probes()).toBe(probesAfterFailure);
    chase.chaseTarget(session, player, target, 1_300, 1, true);
    expect(probes()).toBeGreaterThan(probesAfterFailure);
    expect(steps).toHaveLength(0);
  });
});
