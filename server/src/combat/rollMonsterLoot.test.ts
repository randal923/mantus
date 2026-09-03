import { describe, expect, it } from "vitest";
import type { MonsterLoot } from "../creature/MonsterType";
import type { ItemType } from "../item/ItemType";
import { DISABLED_RARITY_CONFIG } from "../rarity/RarityConfig";
import { rollMonsterLoot, type MonsterLootRoll } from "./rollMonsterLoot";

function itemType(overrides: Partial<ItemType> & { id: number }): ItemType {
  return {
    clientId: overrides.id,
    name: `type-${overrides.id}`,
    spriteId: overrides.id,
    stackable: false,
    maxCount: 1,
    weight: 100,
    pickupable: true,
    movable: true,
    light: { intensity: 0, color: 0 },
    elevation: 0,
    render: {
      ground: false,
      groundBorder: false,
      onBottom: false,
      onTop: false,
      stackable: false,
      fluidContainer: false,
      splash: false,
      hangable: false,
      hookSouth: false,
      hookEast: false,
      lyingCorpse: false,
      animateAlways: false,
      topEffect: false,
    },
    ...overrides,
  };
}

const GOLD = itemType({ id: 3_031, stackable: true, maxCount: 100 });
const SWORD = itemType({ id: 3_264 });

function entry(overrides: Partial<MonsterLoot> = {}): MonsterLoot {
  return {
    itemTypeId: GOLD.id,
    chance: 100_000,
    minCount: 1,
    maxCount: 1,
    unique: false,
    ...overrides,
  };
}

/** Deterministic stand-in for the tick's seeded RNG. */
function roll(
  types: ReadonlyArray<ItemType>,
  options: {
    readonly rolls?: ReadonlyArray<number>;
    readonly pick?: "minimum" | "maximum";
  } = {},
): MonsterLootRoll & { readonly percents: number[] } {
  const percents: number[] = [];
  const rolls = [...(options.rolls ?? [])];
  return {
    percents,
    resolve: (candidate) =>
      types.find((type) => type.id === candidate.itemTypeId),
    chance: (percent) => {
      percents.push(percent);
      return rolls.length > 0 ? (rolls.shift() ?? 0) <= percent : true;
    },
    integer: (minimum, maximum) =>
      options.pick === "minimum" ? minimum : maximum,
  };
}

describe("rollMonsterLoot", () => {
  it("rolls a stackable drop inside its count band, clamped to the stack limit", () => {
    const context = roll([GOLD]);

    expect(
      rollMonsterLoot(
        [entry({ minCount: 3, maxCount: 40 })],
        1,
        context,
      ),
    ).toEqual([{ typeId: GOLD.id, count: 40 }]);
    expect(
      rollMonsterLoot(
        [entry({ minCount: 3, maxCount: 40 })],
        1,
        roll([GOLD], { pick: "minimum" }),
      ),
    ).toEqual([{ typeId: GOLD.id, count: 3 }]);
    // A band wider than the type's stack limit cannot mint an oversized stack.
    expect(
      rollMonsterLoot(
        [entry({ minCount: 1, maxCount: 1_000 })],
        1,
        context,
      ),
    ).toEqual([{ typeId: GOLD.id, count: 100 }]);
  });

  it("drops exactly one of a non-stackable item however wide the band", () => {
    expect(
      rollMonsterLoot(
        [entry({ itemTypeId: SWORD.id, minCount: 2, maxCount: 9 })],
        1,
        roll([SWORD]),
      ),
    ).toEqual([{ typeId: SWORD.id, count: 1 }]);
  });

  it("scales the entry chance by the server loot rate", () => {
    const context = roll([GOLD], { rolls: [100, 100] });

    rollMonsterLoot([entry({ chance: 5_000 })], 1, context);
    rollMonsterLoot([entry({ chance: 5_000 })], 3, context);

    expect(context.percents).toEqual([5, 15]);
  });

  it("never exceeds 100% however high the chance or rate", () => {
    const context = roll([GOLD], { rolls: [100] });

    rollMonsterLoot([entry({ chance: 100_000 })], 50, context);

    expect(context.percents).toEqual([100]);
  });

  it("rolls every entry of a table longer than any corpse slot count", () => {
    const entries = Array.from({ length: 40 }, () => entry());

    // Canary adds loot with FLAG_NOLIMIT: the corpse grows to fit the roll.
    expect(rollMonsterLoot(entries, 1, roll([GOLD]))).toHaveLength(40);
  });

  it("skips an entry naming an item this catalog does not carry", () => {
    const entries = [entry({ itemTypeId: 65_000 }), entry()];

    expect(rollMonsterLoot(entries, 1, roll([GOLD]))).toEqual([
      { typeId: GOLD.id, count: 1 },
    ]);
  });

  it("drops nothing from a zero-chance entry", () => {
    const context = roll([GOLD], { rolls: [1] });

    expect(rollMonsterLoot([entry({ chance: 0 })], 1, context)).toEqual([]);
  });

  it("rolls rarity attributes onto eligible gear only", () => {
    const BLADE = itemType({ id: 3_265, weaponType: "sword" });
    const chances = {
      ...DISABLED_RARITY_CONFIG,
      chances: { uncommon: 100, rare: 0, epic: 0, legendary: 0 },
    };
    // pick=minimum: rarity roll 1 → uncommon; affix pick index 0 → maxHealth
    // at its range minimum.
    const [drop] = rollMonsterLoot(
      [entry({ itemTypeId: BLADE.id })],
      1,
      roll([BLADE], { pick: "minimum" }),
      chances,
    );
    expect(drop?.attributes).toEqual({
      rarity: "uncommon",
      affixes: [{ id: "maxHealth", value: 15 }],
    });

    // Stackables never roll, however certain the chance.
    const [gold] = rollMonsterLoot([entry()], 1, roll([GOLD]), chances);
    expect(gold?.attributes).toBeUndefined();

    // A losing roll leaves the drop common with no attribute bag at all.
    const [common] = rollMonsterLoot(
      [entry({ itemTypeId: BLADE.id })],
      1,
      roll([BLADE], { pick: "maximum" }),
      { ...chances, chances: { ...chances.chances, uncommon: 50 } },
    );
    expect(common?.attributes).toBeUndefined();
  });
});
