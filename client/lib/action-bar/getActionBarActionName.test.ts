import type {
  CarriedItemSummary,
  SpellCatalogEntry,
} from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { getActionBarActionName } from "./getActionBarActionName";

const CARRIED = [
  {
    typeId: 266,
    clientId: 266,
    spriteId: 4321,
    name: "health potion",
    count: 3,
    useKind: "potion",
  },
] as unknown as ReadonlyArray<CarriedItemSummary>;

const NO_SPELLS: ReadonlyArray<SpellCatalogEntry> = [];

describe("getActionBarActionName", () => {
  it("names an object action from the carried summary", () => {
    expect(
      getActionBarActionName(
        { kind: "item", itemTypeId: 266, mode: "use-on-self" },
        NO_SPELLS,
        CARRIED,
      ),
    ).toBe("health potion");
  });

  it("keeps the stored name after the last carried one is consumed", () => {
    // Regression: drinking the final health potion emptied the carried
    // summary and the button/rule fell back to "Object #266", so the
    // assignment looked like it had vanished.
    expect(
      getActionBarActionName(
        {
          kind: "item",
          itemTypeId: 266,
          mode: "use-on-self",
          display: { name: "health potion", clientId: 266, spriteId: 4321 },
        },
        NO_SPELLS,
        [],
      ),
    ).toBe("health potion");
  });

  it("falls back to the type id only when no display was ever stored", () => {
    expect(
      getActionBarActionName(
        { kind: "item", itemTypeId: 266, mode: "use-on-self" },
        NO_SPELLS,
        [],
      ),
    ).toBe("Object #266");
  });
});
