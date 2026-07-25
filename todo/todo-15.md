# Todo 15 — Parties, guilds, PVP, houses, and social services

The cores of all five systems shipped (see [done.md](done.md)): parties with Canary-parity leadership/shared-exp/shields and exploit-tested reward races; durable guilds with ranks, wars, emblems, and the `/g` channel; the pinned PVP skull/frag policy enforced at combat execution with audited sanctions; house import, purchase/transfer/rent/eviction on serializable transactions with idempotent schedules; and VIP/friends, highscores, mail, and moderation with over-share and replay exploit tests. What remains is the long tail on each: party analyzer/finder, guild bank and war stakes, combat-logout persistence and pvp-zone tiles, house auctions/access lists/guildhalls, reciprocal friends, admin-path hardening, and profile projections.

## Remaining features

- [x] **Feature 55 — Party analyzer** — Shipped 2026-07-25. See [completed](completed/implementation-feature-55-completed.md).
- [ ] **Feature 56 — Party finder** — Shipped 2026-07-25; the finder-visibility hook still needs Feature 65's privacy setting. See [implementation](implementation-feature-56.md) · [completed](completed/implementation-feature-56-completed.md).
- [ ] **Feature 57 — Party polish (party-aware spells)** — Invite-pending shields shipped 2026-07-25; party-gated friendly-target spells wait on the spell catalog. See [implementation](implementation-feature-57.md) · [completed](completed/implementation-feature-57-completed.md).
- [ ] **Feature 58 — Guild bank, war stakes, and guild points** — Shipped 2026-07-25; the deposit/withdraw client UI and per-rank withdrawal permission remain. See [implementation](implementation-feature-58.md) · [completed](completed/implementation-feature-58-completed.md).
- [ ] **Feature 59 — Combat-logout in-world persistence** — Shipped 2026-07-25; the end-to-end playtest scenario remains. See [implementation](implementation-feature-59.md) · [completed](completed/implementation-feature-59-completed.md).
- [ ] **Feature 60 — Blessing-loss extras** — pvp-zone tiles shipped 2026-07-25 (the map pipeline already emitted the flag; only the policy consumer was missing); blessing-loss modifiers wait on Feature 72. See [implementation](implementation-feature-60.md) · [completed](completed/implementation-feature-60-completed.md).
- [ ] **Feature 61 — Timed house auctions** — Bid/close auction flow on the existing durable schedule loop with escrowed bank legs. See [implementation](implementation-feature-61.md).
- [ ] **Feature 62 — House access lists (Canary syntax, per-door)** — Canary text access lists (`@guild`, wildcards) and separate per-door lists, evaluated at execution. See [implementation](implementation-feature-62.md).
- [ ] **Feature 63 — Guildhall purchase** — Guildhall-flagged houses purchasable from the guild balance by the leader. See [implementation](implementation-feature-63.md).
- [ ] **Feature 64 — House polish (rent letters, mob blocking, eviction edges)** — Rent-warning letter items, monsters/NPCs blocked from house tiles, eviction/in-flight-persist and inbox-overflow edge cases. See [implementation](implementation-feature-64.md).
- [ ] **Feature 65 — Friend-system completion** — Reciprocal friend requests, VIP groups, typing state, finder visibility, exiva restrictions, ignore lists. See [implementation](implementation-feature-65.md).
- [ ] **Feature 66 — Social-services hardening (GM exclusion, mail rate limit, admin reachability)** — Staff flag for highscores, time-based mail send limit, moderation exposed through the admin path. See [implementation](implementation-feature-66.md).
- [ ] **Feature 67 — Profile projections (achievements, titles, badges, namelocks, character info, casting, bug reports)** — Durable grant tables and bounded public projections; namelock rename flow; casting and bug reports. See [implementation](implementation-feature-67.md).

[Back to overview](README.md)
