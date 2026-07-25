# Todo 15 — Parties, guilds, PVP, houses, and social services

The cores of all five systems shipped (see [done.md](done.md)): parties with Canary-parity leadership/shared-exp/shields and exploit-tested reward races; durable guilds with ranks, wars, emblems, and the `/g` channel; the pinned PVP skull/frag policy enforced at combat execution with audited sanctions; house import, purchase/transfer/rent/eviction on serializable transactions with idempotent schedules; and VIP/friends, highscores, mail, and moderation with over-share and replay exploit tests. What remains is the long tail on each: party analyzer/finder, guild bank and war stakes, combat-logout persistence and pvp-zone tiles, house auctions/access lists/guildhalls, reciprocal friends, admin-path hardening, and profile projections.

## Remaining features

- [x] **Feature 55 — Party analyzer** — Shipped 2026-07-25. See [completed](completed/implementation-feature-55-completed.md).
- [ ] **Feature 56 — Party finder** — Shipped 2026-07-25; the finder-visibility hook still needs Feature 65's privacy setting. See [implementation](implementation-feature-56.md) · [completed](completed/implementation-feature-56-completed.md).
- [ ] **Feature 57 — Party polish (party-aware spells)** — Invite-pending shields shipped 2026-07-25; party-gated friendly-target spells wait on the spell catalog. See [implementation](implementation-feature-57.md) · [completed](completed/implementation-feature-57-completed.md).
- [ ] **Feature 58 — Guild bank, war stakes, and guild points** — Shipped 2026-07-25; the deposit/withdraw client UI and per-rank withdrawal permission remain. See [implementation](implementation-feature-58.md) · [completed](completed/implementation-feature-58-completed.md).
- [ ] **Feature 59 — Combat-logout in-world persistence** — Shipped 2026-07-25; the end-to-end playtest scenario remains. See [implementation](implementation-feature-59.md) · [completed](completed/implementation-feature-59-completed.md).
- [ ] **Feature 60 — Blessing-loss extras** — pvp-zone tiles shipped 2026-07-25 (the map pipeline already emitted the flag; only the policy consumer was missing); blessing-loss modifiers wait on Feature 72. See [implementation](implementation-feature-60.md) · [completed](completed/implementation-feature-60-completed.md).
- [x] **Feature 61 — Timed house auctions** — Shipped 2026-07-25. See [completed](completed/implementation-feature-61-completed.md).
- [ ] **Feature 62 — House access lists (Canary syntax, per-door)** — Server side shipped 2026-07-25; the per-door list editor has no client surface yet. See [implementation](implementation-feature-62.md) · [completed](completed/implementation-feature-62-completed.md).
- [x] **Feature 63 — Guildhall purchase** — Shipped 2026-07-25. See [completed](completed/implementation-feature-63-completed.md).
- [x] **Feature 64 — House polish (rent letters, mob blocking, eviction edges)** — Shipped 2026-07-25; inbox-overflow spillover kept as an audited deviation. See [completed](completed/implementation-feature-64-completed.md).
- [ ] **Feature 65 — Friend-system completion** — Shipped 2026-07-25; exiva restrictions still wait on the spell catalog (todo-8), the ignore list is not yet durable, and VIP groups have no UI. See [implementation](implementation-feature-65.md) · [completed](completed/implementation-feature-65-completed.md).
- [ ] **Feature 66 — Social-services hardening (GM exclusion, mail rate limit, admin reachability)** — Shipped 2026-07-25; the mail rate-limit message is untranslated and the staff flag has no operator tooling. See [implementation](implementation-feature-66.md) · [completed](completed/implementation-feature-66-completed.md).
- [ ] **Feature 67 — Profile projections (achievements, titles, badges, namelocks, character info, casting, bug reports)** — Server side shipped 2026-07-25; casting, the namelock rename flow (Feature 2), and the whole client surface remain. See [implementation](implementation-feature-67.md) · [completed](completed/implementation-feature-67-completed.md).

[Back to overview](README.md)
