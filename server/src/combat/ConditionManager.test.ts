import { describe, expect, it } from "vitest";
import { ConditionManager } from "./ConditionManager";

describe("ConditionManager", () => {
  it("stacks damage conditions to three, keeps the strongest magnitude, and refreshes", () => {
    const conditions = new ConditionManager();
    const application = {
      type: "poison" as const,
      sourceId: "monster",
      durationMs: 5_000,
      magnitude: 3,
      tickIntervalMs: 1_000,
      damageType: "earth" as const,
    };

    conditions.apply(application, 0);
    conditions.apply({ ...application, magnitude: 2 }, 100);
    conditions.apply({ ...application, magnitude: 5 }, 200);
    conditions.apply({ ...application, magnitude: 4 }, 300);

    expect(conditions.project(300)).toEqual([
      { type: "poison", remainingMs: 5_000, stacks: 3 },
    ]);
    expect(conditions.tick(1_000).effects).toEqual([
      {
        sourceId: "monster",
        type: "poison",
        damageType: "earth",
        amount: 15,
      },
    ]);
  });

  it("expires by server time and caps overdue ticks per server tick", () => {
    const conditions = new ConditionManager();
    conditions.apply(
      {
        type: "fire",
        sourceId: "monster",
        durationMs: 10_000,
        magnitude: 2,
        tickIntervalMs: 250,
        damageType: "fire",
      },
      0,
    );

    expect(conditions.tick(5_000).effects).toHaveLength(5);
    expect(conditions.tick(10_000)).toMatchObject({
      changed: true,
      expiredTypes: ["fire"],
    });
    expect(conditions.has("fire")).toBe(false);
  });

  it("extends regeneration from its remaining server-owned duration", () => {
    const conditions = new ConditionManager();
    const regeneration = {
      type: "regeneration" as const,
      sourceId: "player",
      durationMs: 60_000,
    };

    conditions.apply(regeneration, 0);
    conditions.extend(regeneration, 10_000);

    expect(conditions.remainingMs("regeneration", 10_000)).toBe(110_000);
    expect(conditions.project(10_000)).toContainEqual({
      type: "regeneration",
      remainingMs: 110_000,
      stacks: 1,
    });
  });

  it("uses server-authored condition tick sequences and shield capacity", () => {
    const conditions = new ConditionManager();
    conditions.apply(
      {
        type: "curse",
        sourceId: "caster",
        durationMs: 6_000,
        tickIntervalMs: 2_000,
        tickAmounts: [9, 6, 3],
        damageType: "death",
      },
      0,
    );
    conditions.apply(
      {
        type: "magic-shield",
        sourceId: "caster",
        durationMs: 60_000,
        capacity: 100,
      },
      0,
    );

    expect(conditions.tick(2_000).effects[0]?.amount).toBe(9);
    expect(conditions.tick(4_000).effects[0]?.amount).toBe(6);
    expect(conditions.absorbMagicShield(70)).toBe(70);
    expect(conditions.absorbMagicShield(70)).toBe(30);
    expect(conditions.has("magic-shield")).toBe(false);
  });

  it("projects speed, light, outfit, drunk, mute, and lock conditions", () => {
    const conditions = new ConditionManager();
    conditions.apply(
      {
        type: "haste",
        sourceId: null,
        durationMs: 5_000,
        magnitude: 80,
      },
      0,
    );
    conditions.apply(
      {
        type: "paralyze",
        sourceId: "monster",
        durationMs: 5_000,
        magnitude: 30,
      },
      0,
    );
    conditions.apply(
      {
        type: "light",
        sourceId: null,
        durationMs: 5_000,
        light: { intensity: 7, color: 215 },
      },
      0,
    );
    conditions.apply(
      {
        type: "outfit",
        sourceId: null,
        durationMs: 5_000,
        outfit: {
          lookType: 21,
          head: 0,
          body: 0,
          legs: 0,
          feet: 0,
          addons: 0,
        },
      },
      0,
    );
    conditions.apply(
      {
        type: "regeneration",
        sourceId: null,
        durationMs: 5_000,
        magnitude: 4,
        tickIntervalMs: 1_000,
        damageType: "healing",
      },
      0,
    );
    for (const type of [
      "drunk",
      "mute",
      "invisible",
      "combat-lock",
      "pz-lock",
      "magic-shield",
    ] as const) {
      conditions.apply({ type, sourceId: null, durationMs: 5_000 }, 0);
    }

    expect(conditions.speedModifier).toBe(50);
    expect(conditions.light).toEqual({ intensity: 7, color: 215 });
    expect(conditions.outfit?.lookType).toBe(21);
    expect(conditions.tick(1_000).effects).toEqual([
      {
        sourceId: null,
        type: "regeneration",
        damageType: "healing",
        amount: 4,
      },
    ]);
    expect(conditions.project(0).map((state) => state.type)).toEqual(
      expect.arrayContaining([
        "drunk",
        "mute",
        "invisible",
        "regeneration",
        "combat-lock",
        "pz-lock",
        "magic-shield",
      ]),
    );
    expect(conditions.resolveDirection("north", 500)).toBe("north");
  });
});
