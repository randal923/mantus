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
  transitionExemptions?: UnresolvedTransition[];
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
//
// Lowered 2026-07-25 (Feature 4): the `source-not-walkable` bucket (4,156)
// conflated "we could not resolve this" with "a step transition correctly does
// not exist here". A floor-change flag on a tile nobody can stand on never
// fires, so it is not a parity gap. The converter now splits that bucket and
// moves the audited-correct part to `transitionExemptions`, leaving only the
// 824 entries whose tile *is* standable ground blocked by some other item —
// those are still genuine per-entry review work.
const UNRESOLVED_TRANSITION_TOTAL = 2225;
const UNRESOLVED_TRANSITIONS_BY_REASON: Record<string, number> = {
  "blocked-destination": 182,
  "missing-destination": 892,
  "out-of-range-destination": 4,
  "requires-content-action": 323,
  "source-blocked-by-item": 824,
};

// Audited as correctly transition-less rather than unresolved. These are
// ceilings for the same reason the unresolved ones are: the exemption set is a
// claim about the map, so it must not silently grow. A new exemption reason —
// i.e. the classifier deciding on its own that something needs no transition —
// fails the gate.
const TRANSITION_EXEMPTION_TOTAL = 3332;
const TRANSITION_EXEMPTIONS_BY_REASON: Record<string, number> = {
  // The tile's interaction is a rope pull / ladder climb / dropdown, which
  // Canary registers on the item id independently of any step floor change.
  "covered-by-world-action": 1352,
  // No ground on the tile at all: nothing can ever occupy it.
  "source-has-no-ground": 945,
  // The floor-change item is itself non-walkable — roof pieces are the bulk,
  // where the flag describes which way the roof slopes for rendering.
  "source-item-not-walkable": 1035,
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
  const exemptions = content.transitionExemptions ?? [];
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

  it("transition exemptions do not exceed the pinned ceiling", () => {
    expect(exemptions.length).toBeLessThanOrEqual(TRANSITION_EXEMPTION_TOTAL);
  });

  it("every transition exemption names an audited reason", () => {
    const byReason = countBy(exemptions, (exemption) => exemption.reason);
    for (const [reason, count] of byReason) {
      const ceiling = TRANSITION_EXEMPTIONS_BY_REASON[reason];
      expect(
        ceiling,
        `unaudited transition-exemption reason "${reason}" (${count} entries)`,
      ).toBeDefined();
      expect(count, `transition-exemption reason "${reason}"`).toBeLessThanOrEqual(
        ceiling ?? 0,
      );
    }
  });

  it("no exempted reason also appears as unresolved", () => {
    // The two sets are a partition: an entry is either a gap or audited away,
    // never classified as both.
    const unresolvedReasons = new Set(transitions.map((t) => t.reason));
    for (const reason of Object.keys(TRANSITION_EXEMPTIONS_BY_REASON)) {
      expect(unresolvedReasons.has(reason), `"${reason}" leaked`).toBe(false);
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
