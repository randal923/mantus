import { beforeAll, describe, expect, it } from "vitest";
import type { ItemCatalog } from "./ItemCatalog";
import { loadItemCatalog } from "./loadItemCatalog";
import { projectItem } from "./projectItem";
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
      // The classification line comes from the appearances protobuf
      // (Feature 78); without an instance the tier reads 0.
      affixes: [
        { text: "Extra Defense +1" },
        { text: "Classification: 1 Tier: 0" },
      ],
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

  it("imports Canary's market-backed supply-stash eligibility", () => {
    expect(catalog.require(236).stowable).toBe(true);
    expect(catalog.require(3274).stowable).toBe(true);
    expect(catalog.require(3031).stowable).toBeUndefined();
  });

  it("mints this server's own exercise tiers over a stock appearance", () => {
    const lasting = catalog.require(35_285);
    const epic = catalog.require(60_002);

    expect(epic).toMatchObject({
      id: 60_002,
      // Its own id is what the client aliases, so both sides agree on one key.
      clientId: 60_002,
      name: "epic exercise sword",
      charges: 14_000,
      spriteId: lasting.spriteId,
      weight: lasting.weight,
      pickupable: true,
    });
    expect(epic.description).toContain("5x as fast");
    expect(catalog.require(60_102)).toMatchObject({
      name: "legendary exercise sword",
      charges: 30_000,
    });
  });

  it("counts a charged item's own charges, not its type's, in the tooltip", () => {
    const type = catalog.require(60_002);

    expect(toItemTooltip(type).charges).toBe(14_000);
    expect(
      toItemTooltip(type, {
        id: "00000000-0000-4000-8000-000000000001",
        typeId: 60_002,
        count: 1,
        attributes: { charges: 13_998 },
        version: 4,
        location: {
          kind: "container",
          containerId: "00000000-0000-4000-8000-000000000002",
          slot: 0,
        },
      }).charges,
    ).toBe(13_998);
  });

  it("projects server-owned potion resource metadata for configuration UIs", () => {
    const baseItem = {
      id: "00000000-0000-4000-8000-000000000001",
      count: 1,
      attributes: {},
      version: 1,
      location: {
        kind: "container" as const,
        containerId: "00000000-0000-4000-8000-000000000002",
        slot: 0,
      },
    };

    expect(
      projectItem({ ...baseItem, typeId: 239 }, catalog).potionResources,
    ).toEqual(["health"]);
    expect(
      projectItem({ ...baseItem, typeId: 268 }, catalog).potionResources,
    ).toEqual(["mana"]);
    expect(
      projectItem({ ...baseItem, typeId: 7642 }, catalog).potionResources,
    ).toEqual(["health", "mana"]);
  });
});
