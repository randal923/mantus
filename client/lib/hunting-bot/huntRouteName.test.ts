import { HUNTING_BOT_LIMITS } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { huntRouteName } from "./huntRouteName";
import { parseHuntRouteName } from "./parseHuntRouteName";

describe("huntRouteName", () => {
  it("keeps the hunt's own name when it has a single cave", () => {
    expect(huntRouteName("Venore Rotworm Cave", "Venore Rotworm Cave")).toBe(
      "Venore Rotworm Cave",
    );
  });

  it("names the cave a route was seeded from", () => {
    expect(huntRouteName("Darashia Rotworm Caves", "North Cave")).toBe(
      "Darashia Rotworm Caves · North Cave",
    );
  });

  it("stays inside the protocol's name limit", () => {
    const name = huntRouteName("x".repeat(60), "y".repeat(60));

    expect(name.length).toBe(HUNTING_BOT_LIMITS.maxHuntNameLength);
  });

  it("reads back the hunt and cave it wrote", () => {
    const name = huntRouteName("Darashia Rotworm Caves", "Far NorthWest Cave");

    expect(parseHuntRouteName(name)).toEqual({
      placeName: "Darashia Rotworm Caves",
      spotName: "Far NorthWest Cave",
    });
  });

  it("treats a route saved before hunts gathered caves as the hunt itself", () => {
    expect(parseHuntRouteName("Darashia Rotworm Caves")).toEqual({
      placeName: "Darashia Rotworm Caves",
      spotName: null,
    });
  });
});
