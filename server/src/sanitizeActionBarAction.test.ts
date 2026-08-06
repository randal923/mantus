import { describe, expect, it } from "vitest";
import type { SpellRegistry } from "./combat/SpellRegistry";
import type { ItemIntentHandler } from "./item/ItemIntentHandler";
import { sanitizeActionBarAction } from "./sanitizeActionBarAction";

const spells = {
  get: () => undefined,
} as unknown as SpellRegistry;

const items = {
  itemType: (itemTypeId: number) =>
    itemTypeId === 266
      ? {
          id: 266,
          name: "health potion",
          clientId: 266,
          spriteId: 4321,
          useKind: "potion",
        }
      : undefined,
} as unknown as ItemIntentHandler;

describe("sanitizeActionBarAction", () => {
  it("stamps the catalog display onto an object action", () => {
    expect(
      sanitizeActionBarAction(
        { kind: "item", itemTypeId: 266, mode: "use-on-self" },
        "Knight",
        spells,
        items,
      ),
    ).toEqual({
      kind: "item",
      itemTypeId: 266,
      mode: "use-on-self",
      display: { name: "health potion", clientId: 266, spriteId: 4321 },
    });
  });

  it("overwrites a client-forged display with catalog values", () => {
    expect(
      sanitizeActionBarAction(
        {
          kind: "item",
          itemTypeId: 266,
          mode: "use-on-self",
          display: { name: "Blade of Ruin", clientId: 1, spriteId: 1 },
        },
        "Knight",
        spells,
        items,
      ),
    ).toEqual({
      kind: "item",
      itemTypeId: 266,
      mode: "use-on-self",
      display: { name: "health potion", clientId: 266, spriteId: 4321 },
    });
  });

  it("still rejects unknown object types", () => {
    expect(
      sanitizeActionBarAction(
        { kind: "item", itemTypeId: 9999, mode: "use" },
        "Knight",
        spells,
        items,
      ),
    ).toBeNull();
  });
});
