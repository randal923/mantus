# Todo 9 — Death, corpses, loot, and decay

The core death pipeline shipped: exactly-once monster/player death handling, server-rolled loot committed atomically with audits, memory-first corpses with reach-checked loot views, the pinned v1 player death penalty (10% XP, atomic with respawn, replay-proof), and full ground-item decay with stale-guarded transforms (see [done.md](done.md)). What remains is Canary parity breadth: full loot-table import, the complete death-penalty stack, carried/equipped and field-item decay, plus hardening of the memory-first corpse invariants and durable decay deadlines.

## Remaining features

- [ ] **Feature 29 — Monster loot-table parity import** — Import and parity-gate every pinned Canary monster loot table plus corpse and death behaviors. See [implementation](implementation-feature-29.md).
- [ ] **Feature 30 — World-container and loot UX completions** — Nested world-container browsing, pristine seeded map chests, multi-view sessions, quick-loot affordances. See [implementation](implementation-feature-30.md).
- [ ] **Feature 31 — Corpse persistence invariants and retry hardening** — Guard the unpersisted-loot invariant, retry transient DB errors in economy helpers, fix migration-drift in integration tests. See [implementation](implementation-feature-31.md).
- [ ] **Feature 32 — Full Canary player-death penalty parity** — Skill loss, blessings, item/container drop into player corpse, unfair-fight/PVP and vocation/level modifiers. See [implementation](implementation-feature-32.md).
- [ ] **Feature 33 — Carried/equipped and field-item decay** — Equip/de-equip transform chains, spell-field lifecycle, charge-based expiry, decay pauses and callbacks. See [implementation](implementation-feature-33.md).
- [ ] **Feature 34 — Durable decay deadlines** — Persist `decay_at` so deadlines survive restarts exactly; low priority accepted limitation. See [implementation](implementation-feature-34.md).

[Back to overview](README.md)
