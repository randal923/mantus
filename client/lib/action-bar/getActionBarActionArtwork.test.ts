import type { CarriedItemSummary } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { getActionBarActionArtwork } from "./getActionBarActionArtwork";

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

describe("getActionBarActionArtwork", () => {
  it("draws from the carried summary while the object is in stock", () => {
    const artwork = getActionBarActionArtwork(
      { kind: "item", itemTypeId: 266, mode: "use-on-self" },
      CARRIED,
    );
    expect(artwork).toMatchObject({ clientId: 266, spriteId: 4321 });
  });

  it("keeps the stored display after the last carried one is consumed", () => {
    // Regression: drinking the final health potion emptied the carried
    // summary and the button lost its sprite entirely, so the assignment
    // looked like it had vanished from the bar.
    expect(
      getActionBarActionArtwork(
        {
          kind: "item",
          itemTypeId: 266,
          mode: "use-on-self",
          display: { name: "health potion", clientId: 266, spriteId: 4321 },
        },
        [],
      ),
    ).toEqual({ name: "health potion", clientId: 266, spriteId: 4321 });
  });

  it("returns null only when no display was ever stored", () => {
    expect(
      getActionBarActionArtwork(
        { kind: "item", itemTypeId: 266, mode: "use-on-self" },
        [],
      ),
    ).toBeNull();
  });
});
