# Todo 4 — Rendering and animation

The rendering core shipped: full animation-phase support decoded from the pinned DAT, floor-aware rendering per OTClient rules, correct draw order with elevation/occlusion, and the 2026-07-20 audit fixes (liquid-ground misclassification, anchor sorting, `limitsFloorView`, underground cover) — see [done.md](done.md). Four items remain: asset cache-busting, underground multi-floor dynamic visibility, a production world-item seed reconciliation path, and the effects-vs-onTop draw-order deviation.

## Remaining features

- [ ] **Feature 5 — Asset cache-busting for objects.json and atlas sheets** — Sprite catalog and atlases have no content-hash versioning, so users get stale sprites after an asset re-rip. See [implementation](implementation-feature-5.md).
- [ ] **Feature 6 — Underground multi-floor dynamic visibility** — Server sends dynamic entities only for the player's own z underground while the client draws z±2; extend visibility to drawn underground floors. See [implementation](implementation-feature-6.md).
- [ ] **Feature 7 — Production world-item seed reconciliation** — First-class audited script for reconciling persisted world-item rows after a map converter re-run. See [implementation](implementation-feature-7.md).
- [ ] **Feature 8 — Effects/missiles vs onTop draw order** — Effects render above onTop-flagged pieces (archway tops) due to the transient-container perf optimization; resolve the accepted deviation. See [implementation](implementation-feature-8.md).

[Back to overview](README.md)
