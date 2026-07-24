import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Feature 9 — Creature importer typed-data completeness (guard).
//
// The world import report lists every gameplay assignment and procedural
// callback the importer parsed but did not turn into typed data. Parity's end
// state is zero of them; each is currently classified `blocked` and owned by a
// later feature (Todo 11 NPC behavior/shops, Todo 16 bestiary/bosstiary/forge),
// which must define the target representation before the field can be typed.
//
// These assertions are the "gap cannot silently reopen" guard: the ignored
// surface may only SHRINK as those owner-todos land. A brand-new ignored field
// name, a new procedural callback, an unrecognized owner, or a non-`blocked`
// gap all fail the test — that would be a previously-typed behavior regressing
// back into "silently ignored", the exact hole this feature closes. Lower the
// ceilings / prune the allowlists as owner-todos resolve entries.

const reportPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../content/spawns/world-import-report.json",
);

interface Gap {
  kind: string;
  name: string;
  status: string;
  blockedBy?: string;
  ownerTodo?: string;
}
interface UnsupportedDefinition {
  kind: string;
  typeId: string;
  ignoredAssignments: string[];
  proceduralCallbacks: string[];
  gaps: Gap[];
}
interface ImportReport {
  unsupportedDefinitions: UnsupportedDefinition[];
}

const report = JSON.parse(readFileSync(reportPath, "utf8")) as ImportReport;
const definitions = report.unsupportedDefinitions ?? [];

// Pinned 2026-07-24. Every ignored assignment name currently emitted, per kind.
const ALLOWED_IGNORED_ASSIGNMENTS: Record<string, ReadonlySet<string>> = {
  monster: new Set([
    "Bestiary",
    "bosstiary",
    "flags.isPreyExclusive",
    "flags.isPreyable",
    "flags.rewardBoss",
    "raceId",
  ]),
  npc: new Set([
    "currency",
    "flags",
    "moneyToNeedDonation",
    "shop",
    "speechBubble",
    "voices",
  ]),
};

const ALLOWED_CALLBACKS = new Set([
  "onThink",
  "onAppear",
  "onDisappear",
  "onMove",
  "onSay",
  "onCloseChannel",
  "onBuyItem",
  "onSellItem",
  "onCheckItem",
]);

// Owners that legitimately still hold blocked creature gaps. The importer's
// default owner ("04-creatures-spawns-and-ai") is deliberately absent: a gap
// falling through to it means an ignored assignment nobody has been assigned to
// type, which is a regression, not a delegated blocker.
const ALLOWED_OWNERS = new Set([
  "10-npcs",
  "11b-npc-shops",
  "15-optional-features",
]);

// Ceilings pinned 2026-07-24 — these may only decrease.
const UNSUPPORTED_DEFINITIONS_CEILING = 1867;
const IGNORED_ASSIGNMENTS_CEILING = 4926;
const PROCEDURAL_CALLBACKS_CEILING = 6518;

describe("creature import report gap surface (Feature 9)", () => {
  it("only reports monster and npc unsupported definitions", () => {
    for (const definition of definitions) {
      expect(["monster", "npc"]).toContain(definition.kind);
    }
  });

  it("never ignores an assignment outside the pinned allowlist", () => {
    for (const definition of definitions) {
      const allowed = ALLOWED_IGNORED_ASSIGNMENTS[definition.kind];
      for (const field of definition.ignoredAssignments) {
        expect(
          allowed?.has(field),
          `unaudited ignored ${definition.kind} assignment "${field}" on ${definition.typeId}`,
        ).toBe(true);
      }
    }
  });

  it("never lists a procedural callback outside the pinned allowlist", () => {
    for (const definition of definitions) {
      for (const callback of definition.proceduralCallbacks) {
        expect(
          ALLOWED_CALLBACKS.has(callback),
          `unaudited procedural callback "${callback}" on ${definition.typeId}`,
        ).toBe(true);
      }
    }
  });

  it("keeps every gap blocked and owned by a delegated feature", () => {
    for (const definition of definitions) {
      for (const gap of definition.gaps) {
        expect(gap.status).toBe("blocked");
        expect(
          gap.blockedBy && ALLOWED_OWNERS.has(gap.blockedBy),
          `gap "${gap.name}" on ${definition.typeId} has un-delegated owner "${gap.blockedBy}"`,
        ).toBe(true);
      }
    }
  });

  it("does not grow the ignored gap surface beyond the pinned ceilings", () => {
    const ignored = definitions.reduce(
      (total, definition) => total + definition.ignoredAssignments.length,
      0,
    );
    const callbacks = definitions.reduce(
      (total, definition) => total + definition.proceduralCallbacks.length,
      0,
    );
    expect(definitions.length).toBeLessThanOrEqual(
      UNSUPPORTED_DEFINITIONS_CEILING,
    );
    expect(ignored).toBeLessThanOrEqual(IGNORED_ASSIGNMENTS_CEILING);
    expect(callbacks).toBeLessThanOrEqual(PROCEDURAL_CALLBACKS_CEILING);
  });
});
