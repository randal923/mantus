import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseHuntingPlaces } from "./parseHuntingPlaces";

const CATALOG_URL = new URL(
  "../../public/assets/hunting/hunting_places.json",
  import.meta.url,
);

describe("parseHuntingPlaces", () => {
  it("accepts every copied RubinOT hunting guide", () => {
    const value: unknown = JSON.parse(readFileSync(CATALOG_URL, "utf8"));
    const places = parseHuntingPlaces(value);

    expect(places).toHaveLength(131);
    expect(places[0]?.Name).toBe("Kha'labal Terramites Cave");
    expect(places[0]?.WayPath.Position).toEqual({ x: 33096, y: 32698, z: 8 });
    expect(
      Object.keys(
        places.find((place) => place.Name === "Darashia Dragon Lair")
          ?.WayPath.Coordinates ?? {},
      ),
    ).toEqual(["7", "8", "9", "10"]);
  });

  it("rejects malformed coordinates from the fetched asset", () => {
    const value: unknown = JSON.parse(readFileSync(CATALOG_URL, "utf8"));
    if (!Array.isArray(value)) throw new Error("fixture is not an array");
    const first = value[0];
    if (first === null || typeof first !== "object") {
      throw new Error("fixture has no first guide");
    }
    const invalid = [{ ...first, WayPath: { Coordinates: { 7: [[{ x: -1 }]] }, Paths: [] } }];

    expect(() => parseHuntingPlaces(invalid)).toThrow(
      "invalid hunting place catalog",
    );
  });
});
