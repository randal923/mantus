import { describe, expect, it } from "vitest";
import type { EquipmentSlot } from "@tibia/protocol";
import type { Item } from "../item/Item";
import type {
  ImbuementCatalog,
  ImbuementDefinition,
} from "./ImbuementCatalog";
import { playerImbuementEffects } from "./playerImbuementEffects";

function definition(
  id: number,
  effect: ImbuementDefinition["effect"],
): ImbuementDefinition {
  return {
    id,
    name: `imbuement-${id}`,
    baseId: 3,
    categoryId: 1,
    categorySlug: "test",
    iconId: 1,
    premium: false,
    description: "",
    effect,
    astralSources: [],
  };
}

function catalogOf(
  ...definitions: ReadonlyArray<ImbuementDefinition>
): ImbuementCatalog {
  return {
    bases: new Map(),
    categories: new Map(),
    imbuements: new Map(definitions.map((entry) => [entry.id, entry])),
  };
}

function equipped(
  id: string,
  slot: EquipmentSlot,
  imbuementIds: ReadonlyArray<number>,
  remainingSeconds = 100,
): { item: Item } {
  return {
    item: {
      id,
      typeId: 1,
      count: 1,
      version: 1,
      attributes: {
        imbuements: imbuementIds.map((imbuementId, index) => ({
          slot: index,
          imbuementId,
          remainingSeconds,
        })),
      },
      location: { kind: "equipment", characterId: "c-1", slot },
    },
  };
}

describe("playerImbuementEffects", () => {
  it("sums Swiftness speed across items and takes the highest Featherweight percent", () => {
    const catalog = catalogOf(
      definition(90, { kind: "speed", amount: 10 }),
      definition(91, { kind: "speed", amount: 15 }),
      definition(92, { kind: "capacity", percent: 3 }),
      definition(93, { kind: "capacity", percent: 9 }),
    );
    const effects = playerImbuementEffects(
      [
        equipped("a", "boots", [90, 92]),
        equipped("b", "helmet", [91, 93]),
      ],
      catalog,
    );
    expect(effects.speed).toBe(25);
    expect(effects.capacityPercent).toBe(9);
  });

  it("reads vibrancy deflect from the boots slot only", () => {
    const catalog = catalogOf(
      definition(94, {
        kind: "paralysis",
        removeChancePercent: 42,
        pvpDeflect: true,
      }),
    );
    const onBoots = playerImbuementEffects(
      [equipped("a", "boots", [94])],
      catalog,
    );
    expect(onBoots.paralysisRemoveChancePercent).toBe(42);
    expect(onBoots.paralysisPvpDeflect).toBe(true);

    const onHelmet = playerImbuementEffects(
      [equipped("a", "helmet", [94])],
      catalog,
    );
    expect(onHelmet.paralysisRemoveChancePercent).toBe(0);
    expect(onHelmet.paralysisPvpDeflect).toBe(false);
  });

  it("ignores expired entries entirely", () => {
    const catalog = catalogOf(
      definition(90, { kind: "speed", amount: 10 }),
      definition(93, { kind: "capacity", percent: 9 }),
    );
    const effects = playerImbuementEffects(
      [equipped("a", "boots", [90, 93], 0)],
      catalog,
    );
    expect(effects.speed).toBe(0);
    expect(effects.capacityPercent).toBe(0);
  });
});
