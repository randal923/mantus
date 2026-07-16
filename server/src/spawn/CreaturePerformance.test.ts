import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { gridMapData } from "../gridMapData";
import { findPath } from "../pathfinding/findPath";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import type { Visibility } from "../Visibility";
import { World } from "../World";
import { loadCreatureContent } from "./loadCreatureContent";
import { SpawnManager } from "./SpawnManager";

const visibility = {
  announceCreatureSpawn: () => undefined,
  announceCreatureLeave: () => undefined,
  onCreatureStepped: () => undefined,
  broadcastPose: () => undefined,
} as unknown as Visibility;

describe("full-world creature performance budgets", () => {
  it("loads every placement and keeps spawn and AI work bounded", () => {
    const startedLoading = performance.now();
    const loaded = loadCreatureContent("world", "otservbr");
    const loadMs = performance.now() - startedLoading;
    expect(loaded.monsterTypes.size).toBe(897);
    expect(loaded.npcTypes.size).toBe(956);
    expect(loaded.slots).toHaveLength(84_294);
    expect(loaded.slots.filter((slot) => slot.enabled)).toHaveLength(83_493);
    expect(loadMs).toBeLessThan(2_000);

    const localSlot = loaded.slots.find((slot) => slot.enabled);
    if (!localSlot) throw new Error("world content has no enabled slot");
    const world = new World(
      gridMapData({
        name: "test",
        width: 65_536,
        height: 65_536,
        floors: Array.from({ length: 16 }, (_, z) => z),
        blocked: [],
      }),
      25,
    );
    world.addPlayer(
      new Player(makeCharacter("benchmark-player"), {
        x: localSlot.home.x > 0 ? localSlot.home.x - 1 : localSlot.home.x + 1,
        y: localSlot.home.y,
        z: localSlot.home.z,
      }),
    );
    const startedIndexing = performance.now();
    const manager = new SpawnManager(world, visibility, loaded, {
      activationRange: { x: 32, y: 32 },
      retryMs: 100,
      maxSpawnChecksPerTick: 128,
      maxSpawnAttemptsPerTick: 8,
      maxAiScansPerTick: 128,
      maxAiWorkPerTick: 512,
      ai: {
        thinkIntervalMs: 250,
        acquisitionRange: 8,
        loseRange: 12,
        maxPathNodes: 96,
        wanderChance: 0.2,
        seed: 123,
      },
    });
    expect(performance.now() - startedIndexing).toBeLessThan(1_000);

    const startedTicking = performance.now();
    for (let index = 0; index < 200; index++) {
      const metrics = manager.tick(1_000 + index * 250);
      expect(metrics.spawnChecks).toBeLessThanOrEqual(128);
      expect(metrics.spawnAttempts).toBeLessThanOrEqual(8);
      expect(metrics.aiScans).toBeLessThanOrEqual(128);
      expect(metrics.aiWork).toBeLessThanOrEqual(512);
    }
    expect(performance.now() - startedTicking).toBeLessThan(1_000);
  });

  it("keeps repeated bounded path searches within an explicit time budget", () => {
    const started = performance.now();
    for (let index = 0; index < 500; index++) {
      const result = findPath({
        start: { x: 0, y: 0, z: 7 },
        isGoal: (position) => position.x === 8 && position.y === 8,
        canStep: (position) =>
          position.x >= 0 && position.y >= 0 && position.x <= 8 && position.y <= 8,
        maxVisited: 96,
      });
      expect(result.visited).toBeLessThanOrEqual(96);
    }
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
