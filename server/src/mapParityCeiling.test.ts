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

const DISABLED_WORLD_ACTION_TOTAL = 3554;
const DISABLED_WORLD_ACTIONS_BY_KIND: Record<string, number> = {
  dropdown: 82,
  ladder: 20,
  "rope-or-shovel": 3439,
  "rope-spot": 13,
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
});
