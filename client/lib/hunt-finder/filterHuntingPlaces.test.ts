import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterHuntingPlaces } from "./filterHuntingPlaces";
import { parseHuntingPlaces } from "./parseHuntingPlaces";

const CATALOG_URL = new URL(
  "../../public/assets/hunting/hunting_places.json",
  import.meta.url,
);
const PLACES = parseHuntingPlaces(
  JSON.parse(readFileSync(CATALOG_URL, "utf8")) as unknown,
);

describe("filterHuntingPlaces", () => {
  it("filters by level, vocation, team size, and creature search", () => {
    const result = filterHuntingPlaces(PLACES, {
      minimumLevel: 8,
      vocation: "Knight",
      teamSize: "Solo",
      sort: "balanced",
      search: "terramite",
    });

    expect(result.map((place) => place.Name)).toContain(
      "Kha'labal Terramites Cave",
    );
    expect(
      result.every(
        (place) =>
          Number(place.Level) >= 8 &&
          place.Vocation.includes("Knight") &&
          place.Type.includes("Solo"),
      ),
    ).toBe(true);
  });

  it("sorts the matching guides by the selected hourly metric", () => {
    const result = filterHuntingPlaces(PLACES, {
      minimumLevel: 0,
      vocation: "all",
      teamSize: "all",
      sort: "experience",
      search: "",
    });

    expect(result[0]?.["Xp/Hour"]).toBeTruthy();
    expect(result).toHaveLength(131);
  });
});
