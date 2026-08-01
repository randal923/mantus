import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Feature 9 — Creature importer typed-data completeness (guard).
//
// The world import report lists every gameplay assignment and procedural
// callback the creature importer parsed but did not turn into typed data.
// Parity's end state is zero of them. Each carries one of three statuses:
//
// - `covered` — a different pinned importer owns the field and the project
//   already consumes the result (bestiary/bosstiary/raceId, imported by
//   `tools/importCanaryBestiary.mjs`). This test does not take that on trust:
//   it re-derives the coverage from `content/monsters/bestiary.json` and fails
//   if a monster claiming coverage is not actually tracked there.
// - `upstream-defect` — the pinned source itself cannot be imported (a
//   `Bestiary` block with no `monster.raceId`, so there is no id to track kills
//   against). Nothing this project can do; capped at the one known monster.
// - `blocked` — genuinely still owed, owned by a later feature that must define
//   the target representation first (Todo 11 NPC behavior/shops, Todo 16 prey
//   and reward bosses).
//
// These assertions are the "gap cannot silently reopen" guard: the ignored
// surface may only SHRINK. A brand-new ignored field name, a new procedural
// callback, an unrecognized owner, an unrecognized status, or a coverage claim
// that does not hold all fail the test — that would be a previously-typed
// behavior regressing back into "silently ignored", the exact hole this feature
// closes. Lower the ceilings / prune the allowlists as owner-todos resolve
// entries.

const contentDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../content",
);
const reportPath = join(contentDir, "spawns/world-import-report.json");

interface Gap {
  kind: string;
  name: string;
  status: string;
  blockedBy?: string;
  coveredBy?: string;
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

interface BestiaryContent {
  bestiary: ReadonlyArray<{ monsterIds: ReadonlyArray<string> }>;
  bosstiary: ReadonlyArray<{ monsterIds: ReadonlyArray<string> }>;
}

const report = JSON.parse(readFileSync(reportPath, "utf8")) as ImportReport;
const definitions = report.unsupportedDefinitions ?? [];
const bestiary = JSON.parse(
  readFileSync(join(contentDir, "monsters/bestiary.json"), "utf8"),
) as BestiaryContent;
const trackedMonsterIds = new Set(
  [...bestiary.bestiary, ...bestiary.bosstiary].flatMap(
    (entry) => entry.monsterIds,
  ),
);

// Pinned 2026-07-26. Every ignored assignment name currently emitted, per kind.
const ALLOWED_IGNORED_ASSIGNMENTS: Record<string, ReadonlySet<string>> = {
  monster: new Set([
    "Bestiary",
    "bosstiary",
    "flags.isPreyExclusive",
    "flags.isPreyable",
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

/** The only importers that may claim to cover a creature field. */
const ALLOWED_COVERING_IMPORTERS = new Set(["tools/importCanaryBestiary.mjs"]);

// Ceilings lowered 2026-07-26: Feature 76 imported flags.rewardBoss onto
// MonsterType, closing the original 911-monster blocked bucket. What is left blocked
// is flags.isPrey* (147, Todo 16 Feature 74's typed-data tail) and three NPC
// entries. The 11 hunting-guide monsters added on 2026-08-01 contribute only
// Bestiary/raceId fields that the pinned bestiary importer demonstrably covers.
const UNSUPPORTED_DEFINITIONS_CEILING = 750;
const IGNORED_ASSIGNMENTS_CEILING = 1595;
const PROCEDURAL_CALLBACKS_CEILING = 2;
const BLOCKED_GAPS_CEILING = 150;
/** Canary's Crypt Warrior: a Bestiary block with no raceId to track. */
const UPSTREAM_DEFECT_CEILING = 1;

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

  it("keeps every blocked gap owned by a delegated feature", () => {
    for (const definition of definitions) {
      for (const gap of definition.gaps) {
        expect(
          ["blocked", "covered", "upstream-defect"],
          `gap "${gap.name}" on ${definition.typeId} has unknown status "${gap.status}"`,
        ).toContain(gap.status);
        if (gap.status !== "blocked") continue;
        expect(
          gap.blockedBy && ALLOWED_OWNERS.has(gap.blockedBy),
          `gap "${gap.name}" on ${definition.typeId} has un-delegated owner "${gap.blockedBy}"`,
        ).toBe(true);
      }
    }
  });

  // The point of `covered` is that the field is not lost, so the claim has to
  // hold against the covering importer's own output — not just say so.
  it("proves every covered gap really is covered by its named importer", () => {
    for (const definition of definitions) {
      for (const gap of definition.gaps) {
        if (gap.status !== "covered") continue;
        expect(
          gap.coveredBy && ALLOWED_COVERING_IMPORTERS.has(gap.coveredBy),
          `gap "${gap.name}" on ${definition.typeId} claims an unknown covering importer "${gap.coveredBy}"`,
        ).toBe(true);
        expect(
          trackedMonsterIds.has(definition.typeId),
          `${definition.typeId} claims its "${gap.name}" is covered by ${gap.coveredBy}, but bestiary.json does not track it`,
        ).toBe(true);
      }
    }
  });

  it("keeps the blocked and upstream-defect surfaces within their ceilings", () => {
    const byStatus = new Map<string, number>();
    for (const definition of definitions) {
      for (const gap of definition.gaps) {
        byStatus.set(gap.status, (byStatus.get(gap.status) ?? 0) + 1);
      }
    }
    expect(byStatus.get("blocked") ?? 0).toBeLessThanOrEqual(
      BLOCKED_GAPS_CEILING,
    );
    expect(byStatus.get("upstream-defect") ?? 0).toBeLessThanOrEqual(
      UPSTREAM_DEFECT_CEILING,
    );
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
