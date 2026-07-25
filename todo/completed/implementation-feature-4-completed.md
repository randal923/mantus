# Feature 4 — completed sub-work

Feature 4 (disabled map transitions and movement-action parity resolution) is
an **umbrella** whose actual per-entry resolution is delegated to its owning
features — 50-53 (world tool actions: the `rope-or-shovel` bulk) and 61-64
(house/zone ownership). It remains **open** and must not be archived until
those land and the disabled/unresolved counts reach zero. This file records the
discrete self-contained work already finished, moved out of
[implementation-feature-4.md](../implementation-feature-4.md).

Cross-links: [implementation-feature-4.md](../implementation-feature-4.md) ·
[todo-3.md](../todo-3.md).

---

## 2026-07-24 — Aggregate parity-ceiling regression (monotonic non-increase)

**Problem.** The converter classifies every floor-change item and world action
it cannot yet resolve as disabled metadata (`unresolvedTransitions` /
`disabledWorldActions` in the generated content document). Nothing pinned those
counts, so a converter or content change could silently *add* a disabled entry
— a previously-supported map behavior regressing into "silently unsupported",
the exact hole this feature exists to close. Feature 4's own Tests section calls
for an "aggregate count check asserting disabled entries only decrease across
re-imports."

**What changed.**

- `server/src/mapParityCeiling.test.ts` (new) — reads the committed
  `server/data/otservbr.content.json` and asserts, as an upper bound (not
  equality), that:
  - total unresolved transitions ≤ 5557, and no per-`reason` bucket exceeds its
    pinned ceiling (`source-not-walkable` 4156, `missing-destination` 892,
    `requires-content-action` 323, `blocked-destination` 182,
    `out-of-range-destination` 4);
  - total disabled world actions ≤ 3554, and no per-`kind` bucket exceeds its
    pinned ceiling (`rope-or-shovel` 3439, `dropdown` 82, `ladder` 20,
    `rope-spot` 13).
  - A brand-new reason/kind bucket the classifier has never produced also fails
    the test (unaudited category = regression).

  Because the assertions are ceilings, when Features 50-53 / 61-64 resolve
  entries the counts drop and the test keeps passing; it fails only if the gap
  widens. Ceilings should be lowered as features genuinely resolve entries.

**Files touched.** `server/src/mapParityCeiling.test.ts`.

**Verification.** `yarn workspace server test run src/mapParityCeiling.test.ts`
→ 4 passed.

**Residual risk / remaining work (keeps the feature open).** The 5557
unresolved transitions and 3554 disabled actions are still disabled — this
sub-work guards against *regression*, it does not resolve any entry. Per-entry
resolution remains owned by Features 50-53 (world tool actions — the 3439
`rope-or-shovel` entries and remaining ladder/dropdown/rope-spot actions) and
Features 61-64 (house/zone ownership for `requires-content-action` sources).
`source-not-walkable` (4156) and `missing/blocked/out-of-range-destination`
entries are correctly disabled (no reachable/valid destination) but each still
needs individual review before the ledger can assert zero silently-unsupported
map behaviors. Lower the ceilings in this test as those features land.

---

## 2026-07-25 — Hole classification resolved; ceilings lowered

**Problem.** The largest disabled bucket was not a content gap at all. 3,439
of the 3,554 disabled world actions were `rope-or-shovel` entries produced by a
`name.includes("hole")` match in the converter, which swept in every "lava
hole", "tree hole", "small hole" and even "ornate door with a keyhole" on the
map. The audit read as 3,554 unsupported map behaviors when the real number was
two orders of magnitude smaller.

**What changed.** Feature 51 replaced the name match with Canary's pinned
`holeId` table and implemented the rope-through-hole pull, so those placements
became working `rope-hole` actions instead of disabled metadata — see
[implementation-feature-51-completed.md](implementation-feature-51-completed.md).
Two further classification fixes landed here:

- Actions disabled purely because the floor they reach is outside the map now
  say so (`no-floor-above` at z0, `no-floor-below` at z15) instead of carrying
  no reason at all. Nine entries were previously unlabelled.
- `mapParityCeiling.test.ts` gained a third gate: **every** disabled action must
  name an audited reason, with a per-reason ceiling. An unlabelled entry, or a
  new reason category, now fails the test the same way a new kind does.

**Result.** Disabled world actions 3,554 → 348: dropdown 82, rope-hole 233,
ladder 20, rope-spot 13. By reason: blocked-destination 207, missing-destination
74, no-floor-below 53, duplicate-action 9, requires-content-action 4,
no-floor-above 1. Unresolved floor transitions are unchanged at 5,557 — nothing
in this pass touched step-transition classification.

**Files touched.** `server/src/mapParityCeiling.test.ts`, `tools/convertOtbm.mjs`,
`content/source-manifest.json`, regenerated `server/data/otservbr.*`.

**Verification.** `yarn workspace server test` → 1113 passed (the ceiling test's
5 cases included); `yarn test:tools` → 69 passed + `parity:check` clean.

**Residual risk / remaining work (keeps the feature open).** 348 disabled
actions and 5,557 unresolved transitions remain. The disabled actions are now
individually explained and none is a classifier artefact, but the two large
transition buckets still need review: `source-not-walkable` (4,156) is dominated
by roof pieces (1,830 across ids 5033/5035/5037/5039) and by holes 7515-7522
(~1,400) whose tiles cannot be stood on — the latter are now covered by the
`rope-hole` action instead, which is the resolution for that subset and should
be reflected the next time this bucket is audited. `missing-destination` (892)
and `blocked-destination` (182) still need per-entry review, and
`requires-content-action` (323) waits on scripted-action ownership.
