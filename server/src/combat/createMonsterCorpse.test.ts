import { describe, expect, it, vi } from "vitest";
import type { Monster } from "../creature/Monster";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { World } from "../World";
import type { CombatFormula } from "./CombatFormula";
import { createMonsterCorpse } from "./createMonsterCorpse";

describe("createMonsterCorpse loot rate", () => {
  it("multiplies drop chance without multiplying stack count", () => {
    const createCorpse = vi.fn();
    const items = {
      itemType: (typeId: number) =>
        typeId === 100
          ? { id: 100, containerCapacity: 4 }
          : { id: 200, maxCount: 100 },
      itemTypeByName: () => undefined,
      createCorpse,
    } as unknown as ItemIntentHandler;
    const formula = {
      chance: vi.fn((percent: number) => percent >= 100),
      integer: vi.fn(() => 4),
    } as unknown as CombatFormula;
    const monster = {
      position: { x: 5, y: 6, z: 7 },
      type: {
        corpseItemTypeId: 100,
        loot: [{ itemTypeId: 200, chance: 60_000, maxCount: 4 }],
      },
    } as unknown as Monster;

    createMonsterCorpse(
      { getMapItems: () => [] } as unknown as World,
      items,
      formula,
      monster,
      "killer",
      "death:test",
      1_000,
      2,
    );

    expect(formula.chance).toHaveBeenCalledWith(100);
    expect(createCorpse).toHaveBeenCalledWith(
      "killer",
      "death:test",
      monster.position,
      0,
      100,
      [{ typeId: 200, count: 4 }],
      1_000,
    );
  });

  it("creates an empty corpse when loot is disabled", () => {
    const createCorpse = vi.fn();
    const items = {
      itemType: (typeId: number) =>
        typeId === 100
          ? { id: 100, containerCapacity: 4 }
          : { id: 200, maxCount: 100 },
      itemTypeByName: () => undefined,
      createCorpse,
    } as unknown as ItemIntentHandler;
    const formula = {
      chance: vi.fn((percent: number) => percent > 0),
      integer: vi.fn(() => 4),
    } as unknown as CombatFormula;
    const monster = {
      position: { x: 5, y: 6, z: 7 },
      type: {
        corpseItemTypeId: 100,
        loot: [{ itemTypeId: 200, chance: 100_000, maxCount: 4 }],
      },
    } as unknown as Monster;

    createMonsterCorpse(
      { getMapItems: () => [] } as unknown as World,
      items,
      formula,
      monster,
      "killer",
      "death:test",
      1_000,
      0,
    );

    expect(formula.chance).toHaveBeenCalledWith(0);
    expect(createCorpse).toHaveBeenCalledWith(
      "killer",
      "death:test",
      monster.position,
      0,
      100,
      [],
      1_000,
    );
  });
});
