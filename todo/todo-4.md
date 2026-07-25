# Todo 4 — Rendering and animation

The rendering core shipped: full animation-phase support decoded from the pinned DAT, floor-aware rendering per OTClient rules, correct draw order with elevation/occlusion, and the 2026-07-20 audit fixes (liquid-ground misclassification, anchor sorting, `limitsFloorView`, underground cover) — see [done.md](done.md). All four remaining items shipped 2026-07-24; the checkboxes below were verified against the code on 2026-07-25 and this area is complete.

## Remaining features

None.

## Completed features

- [x] **Feature 5 — Asset cache-busting for objects.json and atlas sheets** — content-hash `version` in a no-cache `assets/manifest.json`, appended as `?v=` by `AssetStore`. **Done 2026-07-24** — see [implementation](implementation-feature-5.md) → [completed log](completed/implementation-feature-5-completed.md).
- [x] **Feature 6 — Underground multi-floor dynamic visibility** — one shared `visibleFloorRange` policy gives underground viewers creatures and tile-item states for the cover-aware z±2 range without leaking dynamic entities past a roof. **Done 2026-07-24** — see [implementation](implementation-feature-6.md) → [completed log](completed/implementation-feature-6-completed.md).
- [x] **Feature 7 — Production world-item seed reconciliation** — offline fail-closed `yarn workspace server db:reconcile-world-seed`, deleting only in-place delta rows whose seed fixture survives, with one audit row per deletion in the same transaction. **Done 2026-07-24** — see [implementation](implementation-feature-7.md) → [completed log](completed/implementation-feature-7-completed.md).
- [x] **Feature 8 — Effects/missiles vs onTop draw order** — per-floor `onTop` overlay container above the transient effect layer, so effects draw beneath archway tops as OTClient does. **Done 2026-07-24** — see [implementation](implementation-feature-8.md) → [completed log](completed/implementation-feature-8-completed.md).

[Back to overview](README.md)
