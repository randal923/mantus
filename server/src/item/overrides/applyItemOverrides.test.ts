import { describe, expect, it } from "vitest";
import type { ItemType } from "../ItemType";
import { applyItemOverrides } from "./applyItemOverrides";

const SWORD: ItemType = {
  id: 7382,
  clientId: 7382,
  name: "demonrage sword",
  spriteId: 12_293,
  stackable: false,
  maxCount: 1,
  weight: 15_000,
  attack: 47,
  defense: 22,
  requirements: { level: 60, vocations: ["Knight", "Elite Knight"] },
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
};
const SHIELD: ItemType = { ...SWORD, id: 3411, clientId: 3411, name: "shield" };

describe("applyItemOverrides", () => {
  it("replaces only the overridden fields of the targeted item", () => {
    const [sword, shield] = applyItemOverrides(
      [SWORD, SHIELD],
      [{ id: 7382, attack: 50 }],
    );

    expect(sword).toMatchObject({ attack: 50, defense: 22, weight: 15_000 });
    expect(shield).toBe(SHIELD);
  });

  it("replaces nested objects wholesale rather than merging their keys", () => {
    const [sword] = applyItemOverrides(
      [SWORD],
      [{ id: 7382, requirements: { level: 75 } }],
    );

    expect(sword?.requirements).toEqual({ level: 75 });
  });

  it("keeps the catalog identity even when an override tries to change it", () => {
    const [sword] = applyItemOverrides(
      [SWORD],
      [{ id: 7382, name: "renamed" } as never],
    );

    expect(sword).toMatchObject({ id: 7382, clientId: 7382, name: "renamed" });
  });

  it("fails closed on an override that targets no catalog item", () => {
    expect(() => applyItemOverrides([SWORD], [{ id: 99_999, attack: 1 }]))
      .toThrow(/unknown items: 99999/);
  });

  it("fails closed on two overrides for the same item", () => {
    expect(() =>
      applyItemOverrides([SWORD], [{ id: 7382 }, { id: 7382, attack: 1 }]),
    ).toThrow(/same item id twice/);
  });
});
