# TODO

Follow-ups from the auth implementation and its security review (2026-07-14).
Roadmap lives in `plan.md`; security rules in `AGENTS.md`.

## Instant ban enforcement

Bans currently apply only at login: `banned_until` is read once when the
token is verified, so banning an online player does nothing until they
reconnect. Options considered:

1. Periodic recheck of `banned_until` for online accounts in the tick loop
   (simple; up to ~1 min lag; recurring DB reads).
2. Postgres LISTEN/NOTIFY trigger on `accounts` (instant; plumbing dedicated
   to the hand-edited-DB workflow).
3. **Recommended:** an admin action on the game server (`/ban` command or
   admin endpoint) that writes `banned_until`, kicks the live session, and
   appends to the audit log in one place — the audited path is also the
   instant path (charter: never hand-edit production data).

Build it as part of admin tooling, once strangers can actually play. If a
stopgap is needed sooner, option 1 is ~15 lines in the tick loop.

## Accepted residual risks (auth)

Known and deliberately deferred; revisit before public deployment.

- **Bearer-token replay window.** A stolen access token works until expiry
  (~1h). Inherent to bearer tokens; the one-session-per-account rule makes
  theft visible (the victim is kicked). *Recommendation:* `wss://` + TLS at
  deployment; dev `ws://` is fine on localhost.
- **XSS → localStorage token theft.** Standard SPA trade-off; React's
  escaping is the defense. *Recommendation:* never use
  `dangerouslySetInnerHTML` near user-controlled strings; keep dependencies
  few and current.
- **Name impersonation.** `join` accepts any free-form name, so anyone can
  play as "Randal". *Recommendation:* resolved by the `characters` table
  (unique names owned by accounts) — the next milestone.
- **Signup abuse / credential stuffing.** Supabase's default auth rate
  limits apply. *Recommendation:* enable captcha in Supabase auth settings
  if bot signups or login floods appear.

## Architecture watch list

Known limitations, ordered by when they'll bite (assessed 2026-07-14).

1. **Characters & persistence before more gameplay.** Players are ephemeral
   (`Hero-xxxx`, random spawn, nothing saved). Every system built before the
   `characters` table exists will be retrofitted later — do this next.
2. **Real migrations.** `db/schema.sql` is `CREATE IF NOT EXISTS`-only; the
   first `ALTER` breaks the workflow. Adopt numbered migrations + tracking
   table before the schema grows (hand-rolled or `node-pg-migrate`).
3. **Decompose `GameServer` when combat lands.** It owns sockets, auth
   orchestration, world mutation, and visibility. Split into per-system
   intent handlers + a broadcast/visibility module before it accretes more.
4. **Client reconnect.** No retry/backoff on the game socket; any hiccup is
   a dead window until refresh. Needed before real playtests.
5. ~~**Spatial visibility lookup.**~~ Done 2026-07-14: `SpatialGrid` cell
   index; `World.playersNear` + occupancy checks and all `GameServer`
   broadcast paths now query neighborhoods instead of scanning every
   session. Remaining caveat: step reconciliation assumes 1-tile moves —
   any future teleport/large-jump feature must reconcile visibility
   explicitly (see comment in `GameServer.onPlayerStepped`).
6. **One process = one world (deliberate).** Vertical scaling only; growth
   means more worlds, not bigger ones. Cross-world features would need new
   infrastructure — decide consciously if that ever changes.

## Production checklist (pre-launch)

- [ ] `wss://` (TLS) for the game socket
- [ ] `Origin` allowlist on the WebSocket server (defense-in-depth)
- [ ] Admin ban action (see above) + audit log
- [ ] Characters table: unique names, account-owned, character select
- [ ] Review Supabase auth settings: email confirmation on, captcha,
      rate limits
