# Todo 9 — Death, corpses, loot, and decay

The core death pipeline shipped: exactly-once monster/player death handling, server-rolled loot committed atomically with audits, memory-first corpses with reach-checked loot views, the pinned v1 player death penalty (10% XP, atomic with respawn, replay-proof), and full ground-item decay with stale-guarded transforms whose deadlines now survive a restart (see [done.md](done.md)). What remains is Canary parity breadth: full loot-table import, the complete death-penalty stack, and carried/equipped and field-item decay.

## Remaining features

- [ ] **Feature 29 — Monster loot-table parity import** — Import and parity-gate every pinned Canary monster loot table plus corpse and death behaviors. See [implementation](implementation-feature-29.md).
- [ ] **Feature 30 — World-container and loot UX completions** — Nested world-container browsing, pristine seeded map chests, multi-view sessions, quick-loot affordances. See [implementation](implementation-feature-30.md).
- [x] **Feature 31 — Corpse persistence invariants and retry hardening** — retry consolidated into the shared economy transaction helper, all 18 integration tests replay the real migration directory, and `planDrop`/`planMoveMapItem` no longer guard unpersisted loot. **Done 2026-07-25** — see [completed log](completed/implementation-feature-31-completed.md).
- [ ] **Feature 32 — Full Canary player-death penalty parity** — Skill loss, blessings, item/container drop into player corpse, unfair-fight/PVP and vocation/level modifiers. See [implementation](implementation-feature-32.md).
- [ ] **Feature 33 — Carried/equipped and field-item decay** — Equip/de-equip transform chains, spell-field lifecycle, charge-based expiry, decay pauses and callbacks. See [implementation](implementation-feature-33.md).
- [x] **Feature 34 — Durable decay deadlines** — boot resumes each deadline from the persisted row's age (derived from `items.updated_at`, no new column) instead of re-arming a full duration. **Done 2026-07-25** — see [completed log](completed/implementation-feature-34-completed.md).

[Back to overview](README.md)
