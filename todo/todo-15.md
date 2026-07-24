# Todo 15 — Parties, guilds, PVP, houses, and social services

The cores of all five systems shipped (see [done.md](done.md)): parties with Canary-parity leadership/shared-exp/shields and exploit-tested reward races; durable guilds with ranks, wars, emblems, and the `/g` channel; the pinned PVP skull/frag policy enforced at combat execution with audited sanctions; house import, purchase/transfer/rent/eviction on serializable transactions with idempotent schedules; and VIP/friends, highscores, mail, and moderation with over-share and replay exploit tests. What remains is the long tail on each: party analyzer/finder, guild bank and war stakes, combat-logout persistence and pvp-zone tiles, house auctions/access lists/guildhalls, reciprocal friends, admin-path hardening, and profile projections.

## Remaining features

- [ ] **Feature 55 — Party analyzer** — Per-member loot, supplies, damage, and healing over a hunt session with leader-controlled reset and price mode. See [implementation](implementation-feature-55.md).
- [ ] **Feature 56 — Party finder** — Leader/member party finder (list/search) with bounded read models and privacy rules. See [implementation](implementation-feature-56.md).
- [ ] **Feature 57 — Party polish (invite shields, party-aware spells)** — Pending-invite shield variants and party-gated friendly-target spell selection. See [implementation](implementation-feature-57.md).
- [ ] **Feature 58 — Guild bank, war stakes, and guild points** — Guild balance with ACID deposits/withdrawals, Canary war payment stakes, guild points/level. See [implementation](implementation-feature-58.md).
- [ ] **Feature 59 — Combat-logout in-world persistence** — Keep in-fight characters in the world after disconnect until the combat lock expires, Canary-style. See [implementation](implementation-feature-59.md).
- [ ] **Feature 60 — PVP-zone tiles and blessing-loss extras** — Emit pvp-zone tile flags from map conversion into PvpPolicy; blessing-loss modifiers once blessings ship. See [implementation](implementation-feature-60.md).
- [ ] **Feature 61 — Timed house auctions** — Bid/close auction flow on the existing durable schedule loop with escrowed bank legs. See [implementation](implementation-feature-61.md).
- [ ] **Feature 62 — House access lists (Canary syntax, per-door)** — Canary text access lists (`@guild`, wildcards) and separate per-door lists, evaluated at execution. See [implementation](implementation-feature-62.md).
- [ ] **Feature 63 — Guildhall purchase** — Guildhall-flagged houses purchasable from the guild balance by the leader. See [implementation](implementation-feature-63.md).
- [ ] **Feature 64 — House polish (rent letters, mob blocking, eviction edges)** — Rent-warning letter items, monsters/NPCs blocked from house tiles, eviction/in-flight-persist and inbox-overflow edge cases. See [implementation](implementation-feature-64.md).
- [ ] **Feature 65 — Friend-system completion** — Reciprocal friend requests, VIP groups, typing state, finder visibility, exiva restrictions, ignore lists. See [implementation](implementation-feature-65.md).
- [ ] **Feature 66 — Social-services hardening (GM exclusion, mail rate limit, admin reachability)** — Staff flag for highscores, time-based mail send limit, moderation exposed through the admin path. See [implementation](implementation-feature-66.md).
- [ ] **Feature 67 — Profile projections (achievements, titles, badges, namelocks, character info, casting, bug reports)** — Durable grant tables and bounded public projections; namelock rename flow; casting and bug reports. See [implementation](implementation-feature-67.md).

[Back to overview](README.md)
