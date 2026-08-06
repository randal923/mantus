import { describe, expect, it } from "vitest";
import type { ItemType } from "../item/ItemType";
import { withActionDisplay } from "./withActionDisplay";

const itemType = (itemTypeId: number): ItemType | undefined =>
  itemTypeId === 266
    ? ({
        id: 266,
        name: "health potion",
        clientId: 266,
        spriteId: 4321,
      } as ItemType)
    : undefined;

describe("withActionDisplay", () => {
  it("backfills the display on a stored object action", () => {
    expect(
      withActionDisplay(
        { kind: "item", itemTypeId: 266, mode: "use-on-self" },
        itemType,
      ),
    ).toEqual({
      kind: "item",
      itemTypeId: 266,
      mode: "use-on-self",
      display: { name: "health potion", clientId: 266, spriteId: 4321 },
    });
  });

  it("leaves actions for retired types, spells, and empty slots alone", () => {
    const retired = {
      kind: "item",
      itemTypeId: 9999,
      mode: "use",
    } as const;
    expect(withActionDisplay(retired, itemType)).toBe(retired);
    const spell = {
      kind: "spell",
      spellId: "exori",
      targetMode: "direction",
    } as const;
    expect(withActionDisplay(spell, itemType)).toBe(spell);
    expect(withActionDisplay(null, itemType)).toBeNull();
  });
});
