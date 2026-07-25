# Todo 3 — Map and movement

The converter (all floors 0-15, transition metadata, atomic versioned builds), z-aware server map model, intent-only movement with tick-time revalidation, Canary-compatible stairs/diagonals/auto-walk, floor-aware visibility policy, and the full converter/movement test suite all shipped — see [done.md](done.md). Two items remain: a verified pz-lock bypass on the ladder/hole/rope/levitate use paths, and the parity audit resolving every disabled map transition and movement action.

## Remaining features

- [x] **Feature 3 — pz-lock enforcement on ladder/hole/rope/levitate transitions** — A pz-locked player can enter a protection zone via the use path, which skips the pz-lock destination check normal walking enforces. Completed 2026-07-24; see [implementation](implementation-feature-3.md) → [completed log](completed/implementation-feature-3-completed.md).
- [ ] **Feature 4 — Disabled map transitions and movement-action parity resolution** — Individually resolve every disabled transition, movement action, zone behavior, and invalid placement so no map behavior stays silently unsupported. Disabled world actions fell 3,554 → 348 on 2026-07-25 (the name-matched hole classification was a classifier artefact, not a content gap) and every remaining one names an audited reason; the 5,557 unresolved floor transitions still need per-bucket review. See [implementation](implementation-feature-4.md) · [completed](completed/implementation-feature-4-completed.md).

[Back to overview](README.md)
