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

---

## 2026-07-25 — `source-not-walkable` re-audited; unresolved transitions 5,557 → 2,225

**Problem.** The largest unresolved-transition bucket, `source-not-walkable`
(4,156), conflated two different things: entries we genuinely cannot resolve,
and entries where a step transition *correctly does not exist*. A floor-change
flag on a tile no player can ever stand on never fires, so it is not a parity
gap at all. The previous pass flagged this ("both may be correctly
transition-less rather than unresolved") but left the bucket intact, so the
audit claimed 5,557 unsupported map behaviors when most of them were not
behaviors at all.

**What changed.**

- `tools/convertOtbm.mjs` splits the bucket into audited categories in a pass
  that runs *after* world-action resolution (so `enabled` is final):
  - `covered-by-world-action` (1,352) — an enabled world action already owns the
    tile. These are the holes 7515-7522: Canary registers the rope pull on the
    item id independently of any step floor change, so the rope action *is* the
    resolution, exactly as the previous pass predicted.
  - `source-has-no-ground` (945) — no ground on the tile at all; nothing can
    ever occupy it.
  - `source-item-not-walkable` (1,035) — the floor-change item is itself
    non-walkable. Roof pieces 5033/5035/5037/5039 are the bulk: their
    `floorChange` describes which way the roof slopes for rendering, not a step.
  - `source-blocked-by-item` (824) — standable ground, walkable floor-change
    item, but something *else* solid on the tile. Left unresolved: this is the
    one sub-bucket that can hide a map defect, and it needs per-entry review.
- The three audited-correct categories move to a new `transitionExemptions`
  array in the content document. They are emitted, not dropped, so the exemption
  stays visible and countable.
- Two audit-only inputs feed the split: a `hasGround` sector bitset (deliberately
  absent from `binaryProperties`, so the map binary format is unchanged) and an
  `itemBlocks` flag on the floor-change/teleport record. Both are stripped from
  the published payloads — `mapParityCeiling.test.ts` asserts no leakage.
- `server/src/mapParityCeiling.test.ts` gained three gates: an exemption total,
  a per-reason exemption ceiling (a *new* exemption reason fails — the classifier
  must not decide on its own that something needs no transition), and a
  partition check that no reason appears in both arrays.

**Result.** Unresolved floor transitions 5,557 → **2,225**: missing-destination
892, source-blocked-by-item 824, requires-content-action 323,
blocked-destination 182, out-of-range-destination 4. Plus 3,332 audited
exemptions. Disabled world actions unchanged at 348.

**Files touched.** `tools/convertOtbm.mjs`,
`server/src/mapParityCeiling.test.ts`, `content/source-manifest.json`
(re-pinned converter hash), regenerated `server/data/otservbr.{content,map}.json`
and `client/public/assets/map/otservbr/manifest.json`.

**Verification.** `yarn workspace server test` → 1,120 passed; `yarn test:tools`
→ 69 passed + `parity:check` clean; `yarn typecheck` clean. Minimap PNGs
rebuilt with `node tools/buildMinimapTiles.mjs` — running `convertOtbm.mjs`
alone deletes them, so the pair must always run together.

**Residual risk / remaining work (keeps the feature open).** 2,225 unresolved
transitions and 348 disabled actions remain, all needing content decisions
rather than classifier fixes:
- `source-blocked-by-item` (824) — small boat 285, ramp 204, cave entrance 132,
  hole 55, stairs 53, and a long tail. A ramp with a wall on it is either
  deliberate content or a map defect; only per-entry review can tell.
- `missing-destination` (892) and `blocked-destination` (182) are unchanged and
  still need per-entry review.
- `requires-content-action` (323) still waits on scripted-action/unique-id
  ownership (Features 103-105).
