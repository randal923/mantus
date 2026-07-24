# Todo 13 — Typed world actions

A large slice has shipped (see [done.md](done.md)): the world-action registry with execution-time resolution and fail-closed defaults; doors (Canary pairs, level doors, lock/quest behavior, passability overlays); levers; readables; rope spots; shovel-on-closed-holes with hole-fall and decay re-close; client-side look and the ctrl+click action menu; multi-tile click fixes; map-item rotation/transform-on-use; use-activated dropdowns; and two of the four exploit-test boxes (concurrent/replayed use → one outcome; forged inputs rejected across all shipped kinds). What remains: the unstarted action kinds (chests, pressure plates, teleports, fields), the use-with tool family (fishing, machete, scythe, pick, crowbar, watch, rope-up, sand digging), cross-cutting execution guarantees and DAT flag parsing, and a parity inventory that drives unsupported entries to zero.

## Remaining features

- [ ] **Feature 50 — Remaining world-action kinds (chests, pressure plates, teleports, fields)** — New handlers for the unstarted kinds, plus recorded dropdown deviations (21298, FLAG_NOLIMIT). See [implementation](implementation-feature-50.md).
- [ ] **Feature 51 — Use-with tool actions (fishing, machete, scythe, pick, crowbar, watch)** — Per-tool handlers with server-side RNG, transforms, and skill hooks. See [implementation](implementation-feature-51.md).
- [ ] **Feature 52 — Registry-wide execution guarantees and flag parsing** — Cross-cutting guarantee boxes for every future handler, DAT flag parsing, deferred look/menu/hit-testing/write-map work. See [implementation](implementation-feature-52.md).
- [ ] **Feature 53 — World-action parity inventory** — Classify-everything generator over pinned Canary registrations with a test failing on unclassified entries. See [implementation](implementation-feature-53.md).

[Back to overview](README.md)
