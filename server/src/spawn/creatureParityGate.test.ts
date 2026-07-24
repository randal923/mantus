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
    expect(loaded.monsterTypes.size).toBe(911);
    expect(loaded.npcTypes.size).toBe(956);
    expect(monsterPlacements).toBe(83_286);
    expect(npcPlacements).toBe(1_008);
    expect(loaded.slots).toHaveLength(84_294);
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
    // These normalizations still resolve entries in aggregate; the ceilings
    // fall as Feature 10's per-entry review lands. A new duplicate/ambiguous/
    // bad placement must not slip in unnoticed.
    expect(report.duplicateDefinitions.length).toBeLessThanOrEqual(25);
    expect(report.ambiguousDefinitions.length).toBeLessThanOrEqual(20);
    expect(report.outOfMap.length).toBeLessThanOrEqual(276);
    expect(report.blocked.length).toBeLessThanOrEqual(525);
    // Aliases/duplicates are fully resolved and must stay at zero.
    expect(report.aliases).toHaveLength(0);
    expect(report.duplicates).toHaveLength(0);
  });

  it("pins the reviewed appearance corrections and intentional invisibles", () => {
    expect(report.appearanceValidation.intentionallyInvisible).toBe(5);
    expect(report.invisibleAppearances).toHaveLength(5);
    expect(report.appearanceCorrections).toHaveLength(1);
  });
});
