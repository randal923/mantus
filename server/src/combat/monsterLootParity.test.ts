import { beforeAll, describe, expect, it } from "vitest";
import type { ItemCatalog } from "../item/ItemCatalog";
import { loadItemCatalog } from "../item/loadItemCatalog";
import { quickLootCategory } from "../item/quickLootCategory";
import { loadCreatureContent } from "../spawn/loadCreatureContent";
import type { CreatureContent } from "../spawn/CreatureContent";
import { buildMonsterLootReport } from "./buildMonsterLootReport";
import { resolveMonsterLootType } from "./resolveMonsterLootType";

let catalog: ItemCatalog;
let content: CreatureContent;

beforeAll(async () => {
  catalog = await loadItemCatalog();
  content = loadCreatureContent("world", "otservbr");
});

/**
 * The aggregate gate for every pinned monster loot table. It fails the moment
 * an entry, a count band, a corpse container, or the unresolved-item budget
 * drifts — whether the drift comes from re-importing Canary content or from
 * rebuilding the item catalog.
 */
describe("monster loot parity", () => {
  it("resolves every pinned loot table against the item catalog", () => {
    const report = buildMonsterLootReport(
      content.monsterTypes.values(),
      catalog,
    );

    expect(report.lootBearingMonsters).toBe(793);
    expect(report.entries).toBe(9_821);
    expect(report.resolvedEntries).toBe(9_783);
    expect(report.countedEntries).toBe(2_471);
    // Canary's `unique` loot flag is imported but not modelled by the roll;
    // this pins the surface so a wider use of the flag cannot slip in silently.
    expect(report.uniqueEntries).toBe(3);
    // Pinned gap budget: these twelve items do not exist in the pinned
    // Tibia 15.11 catalog, so their 38 entries can never drop. Any other
    // unresolved name is content drift and fails here.
    expect(report.unresolvedEntries).toBe(38);
    expect(report.unresolvedItemNames).toEqual([
      "basalt core",
      "basalt crumbs",
      "bloated maggot",
      "blooded worm",
      "darklight obsidian axe",
      "demonic core essence",
      "demonic matter",
      "lichen gobbler",
      "mummified demon finger",
      "organic acid",
      "unstable darklight matter",
      "yellow darklight matter",
    ]);
  });

  it("gives every loot table a corpse that can be opened", () => {
    const report = buildMonsterLootReport(
      content.monsterTypes.values(),
      catalog,
    );

    // The lost gnome has `corpse = 0` in Canary too: it leaves nothing.
    expect(report.monstersWithoutCorpse).toEqual(["lost-gnome"]);
    // Everything else drops into a container corpse (2026-09-02): ten corpse
    // ids missing from items.xml are APPEARANCE_ONLY_CORPSES in
    // buildItemCatalog, and the container-less or zero-slot ones carry an
    // override in `item/overrides/corpses`. A corpse grows to the size of its
    // loot, so no table is "too long" for its corpse any more.
    expect(report.monstersWithUncontainableCorpse).toEqual([]);
  });

  it("keeps every loot entry inside its declared bands", () => {
    for (const type of content.monsterTypes.values()) {
      for (const entry of type.loot) {
        expect(entry.chance).toBeGreaterThanOrEqual(0);
        expect(entry.chance).toBeLessThanOrEqual(100_000);
        expect(entry.minCount).toBeGreaterThanOrEqual(1);
        expect(entry.minCount).toBeLessThanOrEqual(entry.maxCount);
        expect(entry.itemTypeId ?? entry.itemName).toBeDefined();
      }
    }
  });

  it("matches pinned Canary tables item for item", () => {
    const rat = content.monsterTypes.get("rat");
    const dragon = content.monsterTypes.get("dragon");

    expect(rat?.corpseItemTypeId).toBe(5_964);
    expect(rat?.loot).toEqual([
      { itemName: "gold coin", chance: 100_000, minCount: 1, maxCount: 4, unique: false },
      { itemTypeId: 3_607, chance: 39_410, minCount: 1, maxCount: 1, unique: false },
    ]);
    // The named entries resolve to the stackable catalog types the roll uses.
    const gold = resolveMonsterLootType(rat!.loot[0]!, {
      byId: (id) => catalog.get(id),
      byName: (name) => catalog.findByName(name),
    });
    expect(gold?.id).toBe(3_031);
    expect(gold?.stackable).toBe(true);
    expect(quickLootCategory(gold!)).toBe("gold");
    expect(
      dragon?.loot.some((entry) => entry.itemName === "dragon ham"),
    ).toBe(true);
  });

  it("gives every droppable loot item a quick-loot bucket", () => {
    const buckets = new Map<string, number>();
    const unliftable: string[] = [];
    for (const type of content.monsterTypes.values()) {
      for (const entry of type.loot) {
        const resolved = resolveMonsterLootType(entry, {
          byId: (id) => catalog.get(id),
          byName: (name) => catalog.findByName(name),
        });
        if (!resolved) continue;
        const bucket = quickLootCategory(resolved);
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
        if (bucket === "none") unliftable.push(resolved.name);
      }
    }

    // Two pinned drops are not pickupable in the Tibia 15.11 catalog, so
    // neither a hand nor a quick-loot sweep can take them out of the corpse —
    // the same outcome Canary's move rules produce. Any third one is drift.
    expect(unliftable.sort()).toEqual(["ice cube", "wooden trash"]);
    expect(buckets.get("gold") ?? 0).toBeGreaterThan(0);
    expect(buckets.get("weapon") ?? 0).toBeGreaterThan(0);
  });
});
