# Feature 67 — Profile projections (achievements, titles, badges, namelocks, character info, casting, bug reports)

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

## Why
Canary exposes public character profiles (achievements, titles, badges, character info) and support flows (namelocks, bug reports, casting). None exist yet; the namelock enum value is already reserved in `021_moderation.sql`.

## Remaining work
- Achievements, titles, badges.
- Namelocks (enum value reserved in `021_moderation.sql`).
- Public character-information projections (Cyclopedia tie-in, Feature 83).
- Livestream/casting.
- Bug reports (Ctrl+Z style).

## Implementation
- Achievements/titles/badges as durable per-character tables with server-side grant hooks fired from progression/bestiary events; exposed only through bounded projections.
- Namelock in `server/src/moderation/ModerationService.ts` using the reserved enum, forcing a rename flow at login (ties to Feature 2 rename infrastructure).
- Public character info as a bounded read model following the `HighscoreService` pattern: fixed parameterized queries, row limits, no private state (charter rules 6 and 7).
- Bug reports as a rate-limited intent persisted like player reports (`/report` pattern: 1/min-style limits, durable rows).
- Casting is a large spectator-stream feature — treat as its own unit when scheduled (also listed under Feature 86's long tail).

## Tests
- Projections expose no private state (inventory, exact position, hidden stats).
- Achievement/title/badge grants are exactly-once under replay/concurrent event delivery.
- Namelocked characters cannot enter the world without completing the rename flow.

## Dependencies
- Feature 83 (Cyclopedia views display these projections).
- Feature 96 (admin tooling issues namelocks).
- Feature 2 (rename flow).
