import { describe, expect, it } from "vitest";
import { loadCreatureContent } from "../spawn/loadCreatureContent";
import { loadBestiaryCatalog } from "./loadBestiaryCatalog";

describe("loadBestiaryCatalog", () => {
  it("joins the shipped bestiary content against the world monster catalog", () => {
    const content = loadCreatureContent("world", "otservbr");
    const catalog = loadBestiaryCatalog(content.monsterTypes);
    expect(catalog.entriesByRaceId.size).toBeGreaterThan(600);
    expect(catalog.bossesByRaceId.size).toBeGreaterThan(30);

    const rat = catalog.entriesByRaceId.get(21);
    expect(rat).toMatchObject({
      className: "Mammal",
      firstUnlock: 10,
      secondUnlock: 100,
      toKill: 250,
      charmPoints: 5,
    });
    expect(rat?.monsterType.name).toBe("Rat");
    expect(catalog.raceIdByMonsterTypeId.get("rat")).toBe(21);

    // Butterfly colors share one race id (one bestiary entry, shared kills).
    expect(catalog.raceIdByMonsterTypeId.get("butterfly")).toBe(
      catalog.raceIdByMonsterTypeId.get("blue-butterfly"),
    );

    // No race id is both a bestiary entry and a boss.
    for (const raceId of catalog.entriesByRaceId.keys()) {
      expect(catalog.bossesByRaceId.has(raceId)).toBe(false);
    }
  });

  it("drops entries whose monsters are absent from this world", () => {
    const catalog = loadBestiaryCatalog(new Map());
    expect(catalog.entriesByRaceId.size).toBe(0);
    expect(catalog.bossesByRaceId.size).toBe(0);
  });
});
