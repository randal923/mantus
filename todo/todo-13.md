# Todo 13 — Typed world actions

A large slice has shipped (see [done.md](done.md)): the world-action registry with execution-time resolution and fail-closed defaults; doors (Canary pairs, level doors, lock/quest behavior, passability overlays); levers; readables; rope spots; shovel-on-closed-holes with hole-fall and decay re-close; client-side look and the ctrl+click action menu; multi-tile click fixes; map-item rotation/transform-on-use; use-activated dropdowns; and two of the four exploit-test boxes (concurrent/replayed use → one outcome; forged inputs rejected across all shipped kinds). What remains: the unstarted action kinds (chests, pressure plates, teleports, fields), the use-with tool family (fishing, machete, scythe, pick, crowbar, watch, rope-up, sand digging), cross-cutting execution guarantees and DAT flag parsing, and a parity inventory that drives unsupported entries to zero.

## Remaining features

- [ ] **Feature 50 — Remaining world-action kinds (fields)** — Chests, pressure plates and traps shipped 2026-07-25; fields stay blocked on `ItemType.field` content, plus the recorded dropdown deviations (21298, FLAG_NOLIMIT). See [implementation](implementation-feature-50.md) · [completed](completed/implementation-feature-50-completed.md).
- [ ] **Feature 51 — Use-with tool actions (remaining)** — Machete, scythe, pick, crowbar, watch, the fishing rod and rope-on-open-holes all shipped 2026-07-25 (the last one also replaced the name-matched hole classification with Canary's pinned `holeId` table, adding 4,968 working rope actions); sand digging and the toolgear jam remain. See [implementation](implementation-feature-51.md) · [completed](completed/implementation-feature-51-completed.md).
- [ ] **Feature 52 — Registry-wide execution guarantees and flag parsing** — The shared precondition table and write-map shipped 2026-07-25; DAT flag parsing and the deferred look/menu/hit-testing work remain. See [implementation](implementation-feature-52.md) · [completed](completed/implementation-feature-52-completed.md).
- [x] **Feature 53 — World-action parity inventory** — Shipped 2026-07-25: 313 registrations classified, 0 unclassified, gated by `worldActionParity.test.ts` and `yarn parity:check`. See [completed](completed/implementation-feature-53-completed.md).

[Back to overview](README.md)
