import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Feature 4 — Disabled map transitions and movement-action parity resolution.
//
// The converter classifies every floor-change item and world action it cannot
// yet resolve as disabled metadata (`unresolvedTransitions` /
// `disabledWorldActions` in the generated content document). Resolving each
// entry is owned by later features (50-53 world tool actions, 61-64
// houses/zones), so the counts legitimately shrink over time — but they must
// never grow. A new disabled entry means a previously-supported map behavior
// silently regressed, which is exactly the parity hole this feature exists to
// close.
//
// These ceilings are the exact counts at the time of writing. They are an
// upper bound, not an equality: when a future feature resolves entries the
// counts drop and this test still passes. Lower a ceiling only when a feature
// genuinely resolves entries; never raise one without a documented reason.

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

interface UnresolvedTransition {
  reason: string;
}
interface DisabledWorldAction {
  kind: string;
  reason?: string;
}
interface ContentDocument {
  unresolvedTransitions?: UnresolvedTransition[];
  disabledWorldActions?: DisabledWorldAction[];
}

const content = JSON.parse(
  readFileSync(join(dataDir, "otservbr.content.json"), "utf8"),
) as ContentDocument;

const countBy = <T>(items: T[], key: (item: T) => string): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const bucket = key(item);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return counts;
};

// Ceilings pinned 2026-07-24 against the committed otservbr content document.
const UNRESOLVED_TRANSITION_TOTAL = 5557;
const UNRESOLVED_TRANSITIONS_BY_REASON: Record<string, number> = {
  "blocked-destination": 182,
  "missing-destination": 892,
  "out-of-range-destination": 4,
  "requires-content-action": 323,
  "source-not-walkable": 4156,
};

// Lowered 2026-07-25 (Feature 51 + Feature 4): the `rope-or-shovel` bucket was
// produced by a `name.includes("hole")` match that swept 3,439 scenery pieces
// (lava holes, tree holes, "ornate door with a keyhole") into "unsupported".
// Replacing it with Canary's pinned `holeId` list turned 4,968 placements into
// working `rope-hole` actions and left 233 genuinely unresolvable ones.
const DISABLED_WORLD_ACTION_TOTAL = 348;
const DISABLED_WORLD_ACTIONS_BY_KIND: Record<string, number> = {
  dropdown: 82,
  ladder: 20,
  "rope-hole": 233,
  "rope-spot": 13,
};

// Every disabled action names why. These are the audited categories:
// the landing tile is missing or blocked and the moveUpstairs neighbour scan
// found nothing; the floor the action would reach is outside the map; a second
// registration of the same activation on one tile; or a scripted action/unique
// id, which stays fail-closed by design.
const DISABLED_WORLD_ACTIONS_BY_REASON: Record<string, number> = {
  "blocked-destination": 207,
  "duplicate-action": 9,
  "missing-destination": 74,
  "no-floor-above": 1,
  "no-floor-below": 53,
  "requires-content-action": 4,
};

describe("map parity ceiling (Feature 4)", () => {
  const transitions = content.unresolvedTransitions ?? [];
  const actions = content.disabledWorldActions ?? [];

  it("unresolved floor transitions do not exceed the pinned ceiling", () => {
    expect(transitions.length).toBeLessThanOrEqual(UNRESOLVED_TRANSITION_TOTAL);
  });

  it("no unresolved-transition reason grows beyond its ceiling", () => {
    const byReason = countBy(transitions, (transition) => transition.reason);
    for (const [reason, count] of byReason) {
      const ceiling = UNRESOLVED_TRANSITIONS_BY_REASON[reason];
      // A brand-new reason bucket is itself a regression — the classifier
      // produced a category we have never audited.
      expect(
        ceiling,
        `unaudited unresolved-transition reason "${reason}" (${count} entries)`,
      ).toBeDefined();
      expect(count, `unresolved-transition reason "${reason}"`).toBeLessThanOrEqual(
        ceiling ?? 0,
      );
    }
  });

  it("disabled world actions do not exceed the pinned ceiling", () => {
    expect(actions.length).toBeLessThanOrEqual(DISABLED_WORLD_ACTION_TOTAL);
  });

  it("no disabled-world-action kind grows beyond its ceiling", () => {
    const byKind = countBy(actions, (action) => action.kind);
    for (const [kind, count] of byKind) {
      const ceiling = DISABLED_WORLD_ACTIONS_BY_KIND[kind];
      expect(
        ceiling,
        `unaudited disabled-world-action kind "${kind}" (${count} entries)`,
      ).toBeDefined();
      expect(count, `disabled-world-action kind "${kind}"`).toBeLessThanOrEqual(
        ceiling ?? 0,
      );
    }
  });

  it("every disabled world action names an audited reason", () => {
    expect(actions.filter((action) => !action.reason)).toEqual([]);
    const byReason = countBy(actions, (action) => action.reason ?? "none");
    for (const [reason, count] of byReason) {
      const ceiling = DISABLED_WORLD_ACTIONS_BY_REASON[reason];
      expect(
        ceiling,
        `unaudited disabled-world-action reason "${reason}" (${count} entries)`,
      ).toBeDefined();
      expect(
        count,
        `disabled-world-action reason "${reason}"`,
      ).toBeLessThanOrEqual(ceiling ?? 0);
    }
  });
});
