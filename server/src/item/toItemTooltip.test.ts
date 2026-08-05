import { describe, expect, it } from "vitest";
import type { Item } from "./Item";
import type { ItemType } from "./ItemType";
import { toItemTooltip } from "./toItemTooltip";

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

function instance(attributes: Record<string, unknown>): Item {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    typeId: 1,
    count: 1,
    attributes,
    version: 1,
    location: { kind: "world", position: { x: 0, y: 0, z: 7 }, stackIndex: 0 },
  };
}

describe("toItemTooltip", () => {
  it("emits the rarity grade and rolled affix lines first", () => {
    const tooltip = toItemTooltip(
      itemType({ id: 1, equipmentSlot: "armor", armor: 4, extraDefense: 1 }),
      instance({
        rarity: "epic",
        affixes: [
          { id: "maxHealth", value: 40 },
          { id: "resistance", value: 6, element: "fire" },
        ],
      }),
    );
    expect(tooltip.rarity).toBe("epic");
    expect(tooltip.affixes.slice(0, 2)).toEqual([
      { text: "+40 Maximum Health", kind: "rolled" },
      { text: "+6% Fire Resistance", kind: "rolled" },
    ]);
    expect(tooltip.affixes[2]).toEqual({ text: "Extra Defense +1" });
  });

  it("omits rarity for common items and catalog-only calls", () => {
    const type = itemType({ id: 1, equipmentSlot: "armor" });
    expect(toItemTooltip(type).rarity).toBeUndefined();
    expect(toItemTooltip(type, instance({})).rarity).toBeUndefined();
  });

  it("composes one imbuement line naming every slot", () => {
    const type = itemType({ id: 1, imbuementSlots: 2 });
    expect(toItemTooltip(type).affixes).toContainEqual({
      text: "Imbuements: (Empty Slot, Empty Slot)",
      kind: "imbuement",
    });
    expect(toItemTooltip(type).imbuementSlots).toBe(2);

    const running = toItemTooltip(
      type,
      instance({
        imbuements: [
          {
            slot: 0,
            imbuementId: 1,
            remainingSeconds: 71_880,
            name: "Powerful Scorch",
          },
        ],
      }),
    );
    expect(running.affixes).toContainEqual({
      text: "Imbuements: (Powerful Scorch 19:58h, Empty Slot)",
      kind: "imbuement",
    });
  });

  it("carries the NPC gold value as worth", () => {
    expect(toItemTooltip(itemType({ id: 1, npcValue: 1_500 })).worth).toBe(
      1_500,
    );
    expect(toItemTooltip(itemType({ id: 1 })).worth).toBeUndefined();
  });
});
