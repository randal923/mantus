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
3. ~~**Decompose `GameServer` when combat lands.**~~ Done 2026-07-14: split
   into `AuthHandler`, `JoinHandler`, `MovementHandler` (per-system intent
   handlers) and `Visibility` (all view-range bookkeeping and broadcasts).
   `GameServer` keeps only socket lifecycle, tick orchestration, and intent
   dispatch — new systems (combat) get their own handler + a case in
   `GameServer.handleIntent`.
4. **Client reconnect.** No retry/backoff on the game socket; any hiccup is
   a dead window until refresh. Needed before real playtests.
5. ~~**Spatial visibility lookup.**~~ Done 2026-07-14: `SpatialGrid` cell
   index; `World.playersNear` + occupancy checks and all `GameServer`
   broadcast paths now query neighborhoods instead of scanning every
   session. Remaining caveat: step reconciliation assumes 1-tile moves —
   any future teleport/large-jump feature must reconcile visibility
   explicitly (see comment in `Visibility.onPlayerStepped`).
6. **One process = one world (deliberate).** Vertical scaling only; growth
   means more worlds, not bigger ones. Cross-world features would need new
   infrastructure — decide consciously if that ever changes.

## Map pipeline (added 2026-07-14)

The real Tibia map (OTServBR `otservbr.otbm`) now drives the game: converted
by `tools/convertOtbm.mjs` (see `map/README.md`), walkability + temple spawn
on the server, HTTP-streamed region JSONs rendered by `client/lib/render/MapView.ts`.
Known, deliberate gaps:

1. **Gameplay is single floor (z=7); rendering covers above-ground only
   (z0–7).** The client stacks floors 7→0 with the one-tile-per-floor
   perspective shift and hides floors above the player when a ground tile
   sits overhead (indoor rule) — but there are no stairs/ladders/holes, no
   underground rendering (z8+ regions aren't exported to the client), and no
   partial transparency for covered areas. Underground locations still show
   black. `GAMEPLAY_FLOOR` in the converter and `server/src/loadMapData.ts`,
   plus `GROUND_FLOOR` in `MapView.ts`, are the anchors. Converter
   `--floors=all` exports client regions, but multi-floor gameplay will also
   require server movement and a regenerated walkability binary.
2. **Ground speed ignored** — step cooldown is constant; real Tibia walks
   faster on pavement than swamp. `objects.json` has `groundSpeed`; wire it
   into `World.tryMove` + client animation when movement gets attention.
3. **Special item state is only partially retained.** The matching asset
   import now supplies stack/fluid/hangable, hook, elevation, displacement,
   ground-border, and lying-corpse flags. The renderer uses the static flags,
   but the converter still drops OTBM count/fluid subtype attributes. Exact
   stack counts and fluids, item animation timing, and large-corpse redraw
   need compact map state encoding and runtime support.
4. **Converted artifacts are gitignored** (`client/public/assets/map/`,
   `server/data/`) — run `yarn map:convert map/otservbr.otbm` after cloning or
   re-ripping assets. OTServBR adds ~80 MB of streamed region JSON. The asset
   pack also has ~126 MB of lazily loaded atlases, while the ~30 MB
   `objects.json` catalog is loaded eagerly. Before public deployment, measure
   startup/network cost; compact or split the catalog and move regions to
   object storage/CDN if the hosting platform needs it.
5. **Protection zones, house ownership, and tile flags** are parsed but
   dropped by the converter; revisit with PvP/houses.

## Production checklist (pre-launch)

- [ ] `wss://` (TLS) for the game socket
- [ ] `Origin` allowlist on the WebSocket server (defense-in-depth)
- [ ] Admin ban action (see above) + audit log
- [ ] Characters table: unique names, account-owned, character select
- [ ] Review Supabase auth settings: email confirmation on, captcha,
      rate limits
