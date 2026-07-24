# Feature 10 — completed sub-work

Feature 10 (placement disambiguation and creature parity gate) stays **open**:
its "keep valid variants addressable via stable variant ids" and per-entry
review of every duplicate/ambiguous/blocked/out-of-map placement is importer +
content-regeneration work, and full gate closure ("zero unreviewed creature/NPC
gameplay fields or callbacks") depends on Feature 9's field-typing, which is
itself blocked on Todo 11 and Todo 16. This file records the self-contained
aggregate parity pins already finished, moved out of
[implementation-feature-10.md](../implementation-feature-10.md).

Cross-links: [implementation-feature-10.md](../implementation-feature-10.md) ·
[implementation-feature-9.md](../implementation-feature-9.md) · [todo-5.md](../todo-5.md).

---

## 2026-07-24 — Aggregate definition/placement parity pins + report reconciliation

**Problem.** Import normalization resolves duplicates and bad placements in
aggregate, but nothing locked the resulting counts, so a content/importer change
could silently reintroduce an ambiguous definition or a bad placement, or drift
the loaded content away from the generated report. Feature 10's Tests call for
exact definition/placement count pins and a zero-unreviewed-fields assertion.

**What changed.**

- `server/src/spawn/CreaturePerformance.test.ts` — added per-kind placement pins
  (83,286 monster, 1,008 NPC) alongside the existing 911/956 type and 84,294
  slot pins.
- `server/src/spawn/creatureParityGate.test.ts` (new) — reconciles the loader
  with the committed `content/spawns/world-import-report.json`:
  - pins the aggregate definition (911 monster / 956 NPC types) and placement
    (83,286 monster / 1,008 NPC) counts;
  - asserts the report's `fullPlacementCounts` equals the loaded per-kind
    placement counts, and `curatedPlacementCounts` equals `fullPlacementCounts`
    (report ↔ content lockstep);
  - caps the still-unresolved resolution buckets so they can only shrink
    (duplicateDefinitions ≤ 25, ambiguousDefinitions ≤ 20, outOfMap ≤ 276,
    blocked ≤ 525) and holds fully-resolved aliases/duplicates at zero;
  - pins the reviewed appearance corrections (1) and intentional invisibles (5).
- The zero-unreviewed-fields half of the gate (every ignored gameplay field or
  callback is a delegated, `blocked` gap owned by a later feature) is already
  enforced by `server/src/spawn/creatureImportReport.test.ts` (Feature 9); this
  file cross-references it rather than duplicating it.

**Files touched.** `server/src/spawn/creatureParityGate.test.ts` (new),
`server/src/spawn/CreaturePerformance.test.ts`.

**Verification.** `yarn workspace server test run
src/spawn/creatureParityGate.test.ts src/spawn/CreaturePerformance.test.ts`
→ 6 passed; full `yarn workspace server test` → 726 passed, 177 skipped, 0
failed; `yarn workspace server typecheck` clean.

**Residual risk / remaining work (keeps the feature open).** The pins guard
against regression but do not resolve the 25 duplicate + 20 ambiguous
definitions, 276 out-of-map + 525 blocked placements individually, and there is
no stable variant-id addressing yet — re-running the importer still picks a
definition by filename order. That per-entry review plus variant-id support in
`tools/importCanaryCreatures.mjs` / `content/monsters/world-monsters.json`, and
the zero-unreviewed-fields closure (gated on Feature 9 → Todo 11/16), remain
open. Lower the ceilings in these tests as each entry is resolved.
