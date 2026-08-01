import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCreatureContent } from "./loadCreatureContent";

// Feature 10 — Placement disambiguation and creature parity gate.
//
// Import normalization resolves duplicates and bad placements in aggregate;
// final parity requires the counts locked so a content/importer change cannot
// silently reintroduce an ambiguous definition or a bad placement. These pins
// reconcile the generated report with what the loader actually returns, and cap
// the still-unresolved resolution buckets so they can only shrink.
//
// The zero-unreviewed-fields half of the gate (every ignored gameplay field or
// callback is a delegated, blocked gap) lives in
// `creatureImportReport.test.ts` (Feature 9). Individual variant addressing via
// stable variant ids remains open — see implementation-feature-10.md.

const reportPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../content/spawns/world-import-report.json",
);

interface ImportReport {
  fullPlacementCounts: { monsters: number; npcs: number };
  curatedPlacementCounts: { monsters: number; npcs: number };
  appearanceValidation: {
    outfits: number;
    items: number;
    intentionallyInvisible: number;
  };
  duplicateDefinitions: unknown[];
  ambiguousDefinitions: unknown[];
  variantFamilies: ReadonlyArray<{
    displayId: string;
    variants: ReadonlyArray<{ typeId: string; name: string; path: string }>;
  }>;
  outOfMap: unknown[];
  blocked: unknown[];
  invisibleAppearances: unknown[];
  appearanceCorrections: unknown[];
  aliases: unknown[];
  duplicates: unknown[];
}

const report = JSON.parse(readFileSync(reportPath, "utf8")) as ImportReport;

describe("creature parity gate (Feature 10)", () => {
  const loaded = loadCreatureContent("world", "otservbr");
  const monsterPlacements = loaded.slots.filter(
    (slot) => slot.kind === "monster",
  ).length;
  const npcPlacements = loaded.slots.filter(
    (slot) => slot.kind === "npc",
  ).length;

  it("pins the aggregate definition and placement counts", () => {
    expect(loaded.monsterTypes.size).toBe(922);
    expect(loaded.npcTypes.size).toBe(956);
    expect(monsterPlacements).toBe(83_369);
    expect(npcPlacements).toBe(1_008);
    expect(loaded.slots).toHaveLength(84_377);
  });

  it("keeps the loaded placements in lockstep with the import report", () => {
    expect(report.fullPlacementCounts).toEqual({
      monsters: monsterPlacements,
      npcs: npcPlacements,
    });
    // Full placements are enabled, so curated equals full for this build.
    expect(report.curatedPlacementCounts).toEqual(report.fullPlacementCounts);
  });

  it("caps the unresolved resolution buckets so they can only shrink", () => {
    // Lowered 2026-07-25: indexing NPC definitions by their Canary *type* name
    // rather than the display name every variant shares left exactly one real
    // collision — Harlow, whose `harlow.lua` and `harlow_trade.lua` both
    // register "Harlow" upstream. The other 24 were Canary's location variants.
    expect(report.duplicateDefinitions).toHaveLength(1);
    expect(report.ambiguousDefinitions).toHaveLength(1);
    expect(report.outOfMap.length).toBeLessThanOrEqual(276);
    expect(report.blocked.length).toBeLessThanOrEqual(525);
    // Aliases/duplicates are fully resolved and must stay at zero.
    expect(report.aliases).toHaveLength(0);
    expect(report.duplicates).toHaveLength(0);
  });

  // Feature 10's "keep valid variants addressable instead of picking one by
  // filename accident": every location variant gets its own id derived from its
  // Canary type name, and no two variants may collide.
  it("gives every variant of a shared display name a distinct addressable id", () => {
    expect(report.variantFamilies.length).toBe(25);
    // The only ids allowed to collide are the ones Canary itself registers
    // twice, which are reported as duplicates and need an upstream decision.
    const reportedDuplicates = new Set(
      (report.duplicateDefinitions as ReadonlyArray<{ typeId: string }>).map(
        (duplicate) => duplicate.typeId,
      ),
    );
    const seen = new Map<string, string>();
    for (const family of report.variantFamilies) {
      expect(
        family.variants.length,
        `variant family ${family.displayId} has no siblings`,
      ).toBeGreaterThan(1);
      for (const variant of family.variants) {
        expect(
          variant.typeId,
          `variant of ${family.displayId} has no type id`,
        ).toBeTruthy();
        const previous = seen.get(variant.typeId);
        if (previous !== undefined) {
          expect(
            reportedDuplicates.has(variant.typeId),
            `variant id "${variant.typeId}" is claimed by both ${previous} and ${variant.path} without being a reported duplicate`,
          ).toBe(true);
          continue;
        }
        seen.set(variant.typeId, variant.path);
      }
    }
    expect(seen.size).toBe(66);
  });

  // A variant id is derived from the pinned Canary type name, so re-running the
  // importer cannot renumber them. Deriving the ids again here from the recorded
  // names is the stability check: a normalization change would break it.
  it("derives variant ids from the pinned type names, so they are stable", () => {
    for (const family of report.variantFamilies) {
      for (const variant of family.variants) {
        const derived = variant.name
          .normalize("NFKD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        expect(variant.typeId, `unstable id for ${variant.path}`).toBe(derived);
      }
    }
  });

  it("pins the reviewed appearance corrections and intentional invisibles", () => {
    expect(report.appearanceValidation.intentionallyInvisible).toBe(5);
    expect(report.invisibleAppearances).toHaveLength(5);
    expect(report.appearanceCorrections).toHaveLength(1);
  });
});
