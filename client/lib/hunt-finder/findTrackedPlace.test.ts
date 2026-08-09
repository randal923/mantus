import { describe, expect, it } from "vitest";
import { findTrackedPlace } from "./findTrackedPlace";
import type { HuntingPlace } from "./HuntingPlace";

const places = [
  { Name: "Amazon Camp" },
  { Name: "Darashia Rotworm Caves" },
] as unknown as ReadonlyArray<HuntingPlace>;

describe("findTrackedPlace", () => {
  it("matches a route named after the hunt itself", () => {
    expect(findTrackedPlace(places, "Amazon Camp")?.Name).toBe("Amazon Camp");
  });

  it("matches a route named after one of the hunt's caves", () => {
    expect(
      findTrackedPlace(places, "Darashia Rotworm Caves · North Cave")?.Name,
    ).toBe("Darashia Rotworm Caves");
  });

  it("returns null when nothing is tracked or the route is unknown", () => {
    expect(findTrackedPlace(places, null)).toBeNull();
    expect(findTrackedPlace(places, "Hero Fortress")).toBeNull();
  });

  it("does not treat a hunt name prefix as a match", () => {
    expect(findTrackedPlace(places, "Amazon Camp Deeper")).toBeNull();
  });
});
