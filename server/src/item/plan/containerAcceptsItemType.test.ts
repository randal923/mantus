import { describe, expect, it } from "vitest";
import type { ItemType } from "../ItemType";
import { containerAcceptsItemType } from "./containerAcceptsItemType";

const makeItemType = (
  overrides: Partial<ItemType> & { id: number },
): ItemType => ({
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
});

const QUIVER = makeItemType({ id: 1, primaryType: "quivers", containerCapacity: 6 });
const BACKPACK = makeItemType({ id: 2, containerCapacity: 20 });
const ARROW = makeItemType({ id: 3, weaponType: "ammunition", ammoType: "arrow" });
const SWORD = makeItemType({ id: 4, weaponType: "sword" });

describe("containerAcceptsItemType", () => {
  it("lets a quiver take ammunition only", () => {
    expect(containerAcceptsItemType(QUIVER, ARROW)).toBe(true);
    expect(containerAcceptsItemType(QUIVER, SWORD)).toBe(false);
    expect(containerAcceptsItemType(QUIVER, BACKPACK)).toBe(false);
  });

  it("lets an ordinary container take anything", () => {
    expect(containerAcceptsItemType(BACKPACK, SWORD)).toBe(true);
    expect(containerAcceptsItemType(BACKPACK, ARROW)).toBe(true);
  });
});
