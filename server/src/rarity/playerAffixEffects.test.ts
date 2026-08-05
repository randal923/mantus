import { describe, expect, it } from "vitest";
import type { Item } from "../item/Item";
import {
  EMPTY_AFFIX_EFFECTS,
  playerAffixEffects,
} from "./playerAffixEffects";

function equipped(attributes: Record<string, unknown>): { item: Item } {
  return {
    item: {
      id: "00000000-0000-4000-8000-000000000001",
      typeId: 1,
      count: 1,
      attributes,
      version: 1,
      location: { kind: "equipment", characterId: "c1", slot: "armor" },
    },
  };
}

describe("playerAffixEffects", () => {
  it("returns the empty singleton for affix-free equipment", () => {
    expect(playerAffixEffects([])).toBe(EMPTY_AFFIX_EFFECTS);
    expect(playerAffixEffects([equipped({})])).toBe(EMPTY_AFFIX_EFFECTS);
  });

  it("sums every affix kind across worn items", () => {
    const effects = playerAffixEffects([
      equipped({
        rarity: "epic",
        affixes: [
          { id: "attack", value: 3 },
          { id: "maxHealth", value: 40 },
          { id: "resistance", value: 6, element: "fire" },
        ],
      }),
      equipped({
        rarity: "rare",
        affixes: [
          { id: "attack", value: 2 },
          { id: "skill", value: 2, skill: "sword" },
          { id: "resistance", value: 5, element: "fire" },
        ],
      }),
    ]);
    expect(effects.attack).toBe(5);
    expect(effects.maxHealth).toBe(40);
    expect(effects.skills.sword).toBe(2);
    expect(effects.resistances.fire).toBe(11);
  });

  it("caps attack speed and leech against degenerate stacking", () => {
    const effects = playerAffixEffects([
      equipped({
        rarity: "legendary",
        affixes: [{ id: "attackSpeed", value: 40 }, { id: "lifeLeech", value: 90 }],
      }),
      equipped({
        rarity: "legendary",
        affixes: [{ id: "attackSpeed", value: 40 }, { id: "lifeLeech", value: 90 }],
      }),
    ]);
    expect(effects.attackSpeedPercent).toBe(50);
    expect(effects.lifeLeechPercent).toBe(100);
  });
});
