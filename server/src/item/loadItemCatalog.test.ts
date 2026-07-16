import { beforeAll, describe, expect, it } from "vitest";
import type { ItemCatalog } from "./ItemCatalog";
import { loadItemCatalog } from "./loadItemCatalog";
import { toItemTooltip } from "./toItemTooltip";

let catalog: ItemCatalog;

describe("loadItemCatalog", () => {
  beforeAll(async () => {
    catalog = await loadItemCatalog();
  });

  it("projects current Tibia weapon stats into the preserved tooltip model", () => {
    expect(toItemTooltip(catalog.require(3273))).toMatchObject({
      name: "Sabre",
      typeLine: "Sword Weapons",
      primaryStat: "Attack 12 · Defense 10",
      affixes: [{ text: "Extra Defense +1" }],
      weight: 2500,
    });
    expect(toItemTooltip(catalog.require(3074))).toMatchObject({
      name: "Wand Of Vortex",
      typeLine: "Wands",
      primaryStat: "Damage 8-18",
      requiredLevel: 6,
      vocations: ["Sorcerer", "Master Sorcerer"],
      weight: 1900,
    });
  });

  it("rejects unknown item ids instead of accepting client-authored stats", () => {
    expect(() => catalog.require(65_535)).toThrow("unknown item type");
  });

  it("imports pinned Canary food durations and messages", () => {
    expect(catalog.require(3577).food).toEqual({
      durationSeconds: 180,
      message: "Munch.",
    });
  });
});
