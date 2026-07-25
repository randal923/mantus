import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadWorldEventContent } from "./loadWorldEventContent";
import { rollWorldEventCheck } from "./rollWorldEventCheck";
import type { WorldEventDefinition } from "./WorldEventDefinition";

const report: {
  readonly counts: {
    readonly imported: number;
    readonly skipped: number;
    readonly unresolvedMonsterNames: number;
  };
  readonly unresolvedMonsterNames: ReadonlyArray<string>;
  readonly skipped: ReadonlyArray<{
    readonly sourcePath: string;
    readonly status: string;
    readonly reason: string;
  }>;
} = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../content/events/canary-raids.json", import.meta.url),
    ),
    "utf8",
  ),
) as never;

const monsterNames: ReadonlySet<string> = new Set(
  (
    JSON.parse(
      readFileSync(
        fileURLToPath(
          new URL(
            "../../../content/monsters/world-monsters.json",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    ) as { types?: ReadonlyArray<{ name: string }> }
  ).types?.map((type) => type.name.toLowerCase()) ?? [],
);

const MONDAY = new Date("2026-07-20T12:00:00.000Z");
const SUNDAY = new Date("2026-07-19T12:00:00.000Z");

const event = (
  overrides: Partial<WorldEventDefinition> = {},
): WorldEventDefinition => ({
  id: "test.raid",
  sourcePath: "test",
  areas: [{ from: { x: 1, y: 1, z: 7 }, to: { x: 2, y: 2, z: 7 } }],
  allowedDays: ["Monday"],
  minActivePlayers: 0,
  targetChancePerDay: 30,
  maxChancePerCheck: 50,
  stages: [{ kind: "announce", message: "hi", advanceAfterMs: 0 }],
  ...overrides,
});

const state = {
  failedAttempts: 0,
  checksToday: 0,
  triggerWhenPossible: false,
  lastOccurrenceAt: null,
};

describe("world event content", () => {
  it("loads every imported raid for the map it was authored for", () => {
    const events = loadWorldEventContent("otservbr");
    expect(events.size).toBe(report.counts.imported);
    for (const definition of events.values()) {
      expect(definition.areas.length).toBeGreaterThan(0);
      expect(definition.stages.length).toBeGreaterThan(0);
      expect(definition.targetChancePerDay).toBeGreaterThan(0);
    }
  });

  it("keeps every raid fail-closed on another map", () => {
    expect(loadWorldEventContent("some-other-map").size).toBe(0);
  });

  it("states a reason for every skipped raid script", () => {
    expect(report.skipped).toHaveLength(report.counts.skipped);
    for (const entry of report.skipped) {
      expect(["deferred", "excluded"]).toContain(entry.status);
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it("pins the raid monsters the pinned creature import cannot spawn", () => {
    // A newly unresolvable name must fail here rather than silently never
    // spawning; shrinking this budget is progress, growing it is a regression.
    expect(report.unresolvedMonsterNames).toHaveLength(17);
    expect(report.counts.unresolvedMonsterNames).toBe(17);
    for (const name of report.unresolvedMonsterNames) {
      expect(monsterNames.has(name.toLowerCase())).toBe(false);
    }
    const spawnNames = new Set(
      [...loadWorldEventContent("otservbr").values()]
        .flatMap((definition) => definition.stages)
        .flatMap((stage) => (stage.kind === "spawn" ? stage.monsters : []))
        .map((monster) => monster.name),
    );
    for (const name of spawnNames) {
      if (monsterNames.has(name.toLowerCase())) continue;
      expect(report.unresolvedMonsterNames).toContain(name);
    }
  });
});

describe("rollWorldEventCheck", () => {
  it("fires when the roll lands inside the chance", () => {
    const outcome = rollWorldEventCheck({
      event: event({ initialChance: 50 }),
      state,
      checkedAt: MONDAY,
      activePlayers: 0,
      roll: 1,
    });
    expect(outcome).toMatchObject({ fired: true, reason: "fired" });
  });

  it("ramps the chance with each failed attempt", () => {
    const definition = event({ initialChance: 0.01, targetChancePerDay: 30 });
    const first = rollWorldEventCheck({
      event: definition,
      state,
      checkedAt: MONDAY,
      activePlayers: 0,
      roll: 5_000,
    });
    expect(first).toMatchObject({ fired: false, reason: "roll-failed" });
    expect(first.failedAttempts).toBe(1);

    const later = rollWorldEventCheck({
      event: definition,
      state: { ...state, failedAttempts: 1_000 },
      checkedAt: MONDAY,
      activePlayers: 0,
      roll: 5_000,
    });
    expect(later.fired).toBe(true);
  });

  it("respects the minimum gap between occurrences", () => {
    expect(
      rollWorldEventCheck({
        event: event({ initialChance: 100, minGapBetweenMs: 3_600_000 }),
        state: {
          ...state,
          lastOccurrenceAt: new Date(MONDAY.getTime() - 60_000),
        },
        checkedAt: MONDAY,
        activePlayers: 0,
        roll: 1,
      }),
    ).toMatchObject({ fired: false, reason: "too-recent" });
  });

  it("defers to the next allowed day instead of firing", () => {
    const outcome = rollWorldEventCheck({
      event: event({ initialChance: 100, allowedDays: ["Monday"] }),
      state,
      checkedAt: SUNDAY,
      activePlayers: 0,
      roll: 1,
    });
    expect(outcome).toMatchObject({
      fired: false,
      reason: "day-not-allowed",
      triggerWhenPossible: true,
    });
  });

  it("defers until enough players are online, then fires without re-rolling", () => {
    const definition = event({ initialChance: 100, minActivePlayers: 3 });
    const deferred = rollWorldEventCheck({
      event: definition,
      state,
      checkedAt: MONDAY,
      activePlayers: 1,
      roll: 1,
    });
    expect(deferred).toMatchObject({
      fired: false,
      reason: "too-few-players",
      triggerWhenPossible: true,
    });

    // With trigger-when-possible set, a losing roll no longer blocks the fire.
    expect(
      rollWorldEventCheck({
        event: definition,
        state: { ...state, triggerWhenPossible: true },
        checkedAt: MONDAY,
        activePlayers: 3,
        roll: 100_000,
      }),
    ).toMatchObject({ fired: true });
  });

  it("stops checking once the daily budget is spent", () => {
    expect(
      rollWorldEventCheck({
        event: event({ initialChance: 100, maxChecksPerDay: 2 }),
        state: { ...state, checksToday: 2 },
        checkedAt: MONDAY,
        activePlayers: 0,
        roll: 1,
      }),
    ).toMatchObject({ fired: false, reason: "checks-exhausted" });
  });
});
