import { describe, expect, it } from "vitest";
import { gridMapData } from "../gridMapData";
import { SessionRegistry } from "../SessionRegistry";
import { Visibility } from "../Visibility";
import { World } from "../World";
import { ItemCatalog } from "./ItemCatalog";
import { ItemIntentHandler } from "./ItemIntentHandler";
import { MemoryItemStore } from "./MemoryItemStore";

describe("ItemIntentHandler", () => {
  it("keeps the inventory capacity projection in sync with level gains", async () => {
    const world = new World(
      gridMapData({
        name: "test",
        width: 3,
        height: 3,
        blocked: [],
      }),
      25,
    );
    const handler = new ItemIntentHandler(
      new MemoryItemStore(),
      new ItemCatalog([]),
      world,
      new Visibility(world, new SessionRegistry()),
    );
    handler.attach(await handler.load("character-id", 400));

    expect(handler.updateCapacity("character-id", 425)).toMatchObject({
      revision: 1,
      capacityMax: 425,
    });
    expect(handler.updateCapacity("character-id", 425)).toBeNull();
  });
});
