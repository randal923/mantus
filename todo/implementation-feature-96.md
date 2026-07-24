# Feature 96 — Role-authorized admin tooling

Part of [Todo 18 — Operations, observability, and security](todo-18.md).

## Why
A significant moderation implementation already exists: `server/src/moderation/` (ModerationService, PgModerationStore, ChatModerationHooks, with tests) implements kick/ban/unban/mute/unmute with immediate live-session kick and a `moderation_actions` audit row in the same transaction; `server/src/gm/GmCommandHandler.ts` wires `/kick`, `/ban`, `/mute`. But it is gated only by `DEV_COMMANDS=1` (never enabled in production per `server/src/config.ts:37`) — there is no per-account role authorization, so none of it is usable in production. One role-column migration plus a session gate closes gaps in three areas at once: this feature, todo-19's instant-ban residual, and todo-20's server-wide-GM-commands gap.

## Remaining work
- Authenticated, role-authorized admin actions: kick, ban, mute, teleport, content/event controls, read-only inspection.
- Audit every action with actor, target, reason, before/after state, and result.
- Never hand-edit production data as routine administration.
- Add role-authorization tests.

## Implementation
- Account role column (new migration) plus a per-session role gate in `server/src/gm/GmCommandHandler.ts` — exactly the fix for todo-20's "server-wide GM commands" gap; also unblocks todo-19's instant-ban production path, Feature 66's moderation reachability, and the highscore staff flag.
- `ModerationService.ts` already enqueues through the tick and writes audit rows in-transaction (charter rules 5 and 11 satisfied); extend the same pattern to teleport, content/event controls, and read-only inspection.
- Authorization derives from the session's own authenticated account (charter rule 9) — never from a role claim in the message body.

## Tests
- Correct role required per command; unauthorized/forged admin intents rejected and reported.
- Target validated at execution time.
- Complete audit record written in the same transaction as the action.

## Dependencies
- Unblocks Feature 66 (social hardening admin roles), Feature 101 (instant-ban role gate), Feature 102 (per-account GM gating), Feature 43 (admin Mantus Coin grants), Feature 54 (world-event operator controls).
- Converges with Features 101 and 102 — land the role migration once, here.
