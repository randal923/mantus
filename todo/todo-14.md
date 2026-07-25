# Todo 14 — Raids and world events

Nothing has shipped in this area (see [done.md](done.md)); `server/src/event/` does not exist. All work is in a single feature: a typed, durable, restart-safe world event engine covering raids, global events, daily resets, and boosted rotations. This area depends on todo-4 (spawns) and todo-13 (event action steps), and explicitly does not wait for the quest storage platform — the pinned raid scripts use no player storage.

## Remaining features

- [ ] **Feature 54 — World event engine (remaining)** — The durable engine and the 18-raid import lane shipped 2026-07-25; the other global events, daily resets, boosted rotations and reward steps remain. See [implementation](implementation-feature-54.md) · [completed](completed/implementation-feature-54-completed.md).

[Back to overview](README.md)
