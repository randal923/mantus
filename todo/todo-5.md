# Todo 5 — Creatures, spawns, and AI

The full Canary creature world shipped: typed `MonsterType`/`NpcType` data with no runtime Lua, all 84,294 world placements (911 monster types, 956 NPC types) live behind passing memory/spawn/AI/pathfinding benchmarks, a tick-owned `SpawnManager`, budgeted AI with z-aware A*, and a 911-monster parity audit with shared corrections, voices, and summon rows (see [done.md](done.md)). What remains is closing the last ignored importer fields and individually resolving every ambiguous definition and placement before locking the aggregate parity gate.

## Remaining features

- [ ] **Feature 9 — Creature importer typed-data completeness** — every ignored gameplay assignment and procedural callback in the world import report becomes typed data or reviewed TypeScript. Bestiary/bosstiary/raceId ownership recorded and machine-verified 2026-07-25 (1,424 gaps `covered`, and a stale `bestiary.json` missing six creatures was caught by the new proof); 1,061 gaps remain blocked on Todo 16's prey and reward-boss features. See [implementation](implementation-feature-9.md) · [completed](completed/implementation-feature-9-completed.md).
- [ ] **Feature 10 — Placement disambiguation and creature parity gate** — individually resolve every duplicate/ambiguous definition and bad placement, then lock aggregate parity tests. Variant addressing landed 2026-07-25: keying on Canary's type name instead of the shared display name took duplicates 25 → 1 and ambiguous 20 → 1 (both the genuine Harlow collision), with 67 location variants now recorded and addressable. See [implementation](implementation-feature-10.md) · [completed](completed/implementation-feature-10-completed.md).

[Back to overview](README.md)
