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
