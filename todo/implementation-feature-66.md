# Feature 66 — Social-services hardening (GM exclusion, mail rate limit, admin reachability)

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

## Why
Three recorded caveats from the shipped social core: highscores can list staff characters, mail has no time-based send limit, and moderation actions are not reachable from a production admin surface.

## Remaining work
- Highscore GM exclusion — needs a staff/GM flag; coordinate with admin roles (Feature 96).
- Mail send time-based rate limit — the pattern already exists (`/report` is 1/min + 20/day); mail currently has only the per-session mutex.
- Production moderation reachability — expose mutes/kicks/bans/notes through the admin path; no new game logic required.

## Implementation
- Staff-flag migration + filter in `server/src/social/PgHighscoreStore.ts` (keep queries parameterized and bounded as today).
- Rate check at execution time in the mail send handler (todo-12 mail path), mirroring the `/report` limiter.
- Route the Feature 96 admin surface to `server/src/moderation/ModerationService.ts` — reuse the existing authorized/audited actions.

## Tests
- Staff characters excluded from all 9 highscore categories.
- Mail sends beyond the rate limit rejected server-side regardless of client pacing.
- Admin moderation calls are authorized and land in `moderation_actions` exactly as in-game commands do.

## Dependencies
- Feature 96 (admin tooling / staff roles).
