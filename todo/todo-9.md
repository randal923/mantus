# Todo 9 — Death, corpses, loot, and decay

The core death pipeline shipped: exactly-once monster/player death handling, server-rolled loot committed atomically with audits, memory-first corpses with reach-checked loot views, the pinned v1 player death penalty (10% XP, atomic with respawn, replay-proof), and full ground-item decay with stale-guarded transforms whose deadlines now survive a restart (see [done.md](done.md)). What remains is Canary parity breadth: full loot-table import, the complete death-penalty stack, and carried/equipped and field-item decay.

## Remaining features

- [ ] **Feature 29 — Monster loot-table parity import** — lossless import, Canary roll semantics, quick-loot buckets and the aggregate parity gate over all 782 loot-bearing monsters shipped 2026-07-25 ([log](completed/implementation-feature-29-completed.md)); child containers, `unique`, reward chests and per-monster death callbacks remain. See [implementation](implementation-feature-29.md).
- [x] **Feature 30 — World-container and loot UX completions** — nested browsing, multi-view sessions, materialize-on-open map chests and a category-filtered quick-loot sweep, all still reach- and revision-checked per tick. **Done 2026-07-25** — see [completed log](completed/implementation-feature-30-completed.md).
- [x] **Feature 31 — Corpse persistence invariants and retry hardening** — retry consolidated into the shared economy transaction helper, all 18 integration tests replay the real migration directory, and `planDrop`/`planMoveMapItem` no longer guard unpersisted loot. **Done 2026-07-25** — see [completed log](completed/implementation-feature-31-completed.md).
- [ ] **Feature 32 — Full Canary player-death penalty parity** — the loss formula, skill/magic-level loss and the unfair-fight reduction shipped 2026-07-25 ([log](completed/implementation-feature-32-completed.md)); blessings and item drop into a player corpse remain (both follow Feature 72). See [implementation](implementation-feature-32.md).
- [ ] **Feature 33 — Carried/equipped and field-item decay** — carried/equipped decay (burning rings, perishables, logout-safe deadlines) shipped 2026-07-25 ([log](completed/implementation-feature-33-completed.md)); spell fields as world items, charge expiry and decay callbacks remain. See [implementation](implementation-feature-33.md).
- [x] **Feature 34 — Durable decay deadlines** — boot resumes each deadline from the persisted row's age (derived from `items.updated_at`, no new column) instead of re-arming a full duration. **Done 2026-07-25** — see [completed log](completed/implementation-feature-34-completed.md).

[Back to overview](README.md)
