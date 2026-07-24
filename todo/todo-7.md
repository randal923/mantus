# Todo 7 — Vocations, stats, and progression

Typed vocation data, persistent skills/experience with authoritative idempotent awards, bounded-tick regen/training, every pinned vocation and promotion (including Monk/Exalted Monk), NPC promotion purchase, and the character-details UI all shipped with their required tests (see [done.md](done.md)). What remains is stamina/soul/training systems, pruning the unbounded progression event-id set, and exhaustive coefficient fixtures.

## Remaining features

- [ ] **Feature 18 — Stamina, soul rules, and training systems** — remaining persistent progression modifiers; stamina is explicitly required parity. See [implementation](implementation-feature-18.md).
- [x] **Feature 19 — Progression event-id pruning** — every kill appends a `death:{uuid}` id to `processedEventIds`/`progression_events` and nothing prunes; bound the retained window. **Done 2026-07-24** — see [completed log](completed/implementation-feature-19-completed.md).
- [ ] **Feature 20 — Exhaustive vocation coefficient fixtures** — aggregate checks so every pinned progression coefficient is matched or explicitly non-gameplay. See [implementation](implementation-feature-20.md).

[Back to overview](README.md)
