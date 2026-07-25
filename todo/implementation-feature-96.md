# Feature 96 — Role-authorized admin tooling

Part of [Todo 18 — Operations, observability, and security](todo-18.md).

## Why
A significant moderation implementation already exists: `server/src/moderation/` (ModerationService, PgModerationStore, ChatModerationHooks, with tests) implements kick/ban/unban/mute/unmute with immediate live-session kick and a `moderation_actions` audit row in the same transaction; `server/src/gm/GmCommandHandler.ts` wires `/kick`, `/ban`, `/mute`. But it is gated only by `DEV_COMMANDS=1` (never enabled in production per `server/src/config.ts:37`) — there is no per-account role authorization, so none of it is usable in production. One role-column migration plus a session gate closes gaps in three areas at once: this feature, todo-19's instant-ban residual, and todo-20's server-wide-GM-commands gap.

> **Status: open.** The role migration, the capability model, per-command
> gating and the teleport/inspect surface shipped 2026-07-25 — see the
> [completed log](completed/implementation-feature-96-completed.md). What
> remains is operator tooling to assign roles and moving the content/event
> controls off the dev switch.

## Remaining work
- ~~Authenticated, role-authorized admin actions: kick, ban, mute, teleport, read-only inspection.~~
  Shipped 2026-07-25: `server/src/auth/AccountRole.ts` capabilities,
  `ModerationCommandHandler` per-command gating, `AdminCommandHandler`
  (`/goto`, `/bring`, `/inspect`).
- **Content/event controls** are still `DEV_COMMANDS`-only (`/raid`, `/coins`,
  `/storerefund` in `GmCommandHandler`). Each needs a capability
  (`world.content`, `economy.grant` are the obvious additions) and a move onto
  the production surface. Owners: Feature 43 (coins/refund), Feature 54 (raid).
- **Operator tooling to set a role.** `accounts.role` still has to be set with
  direct SQL; that is the last piece of "never hand-edit production data as
  routine administration".
- ~~Audit every action with actor, target, reason, before/after state, and result.~~
  Shipped: `moderation_actions` gained `teleport`/`inspect` and a `detail`
  jsonb column carrying before/after positions.
- ~~Add role-authorization tests.~~ Shipped: `AccountRole.test.ts` (6 cases
  including fail-closed and ladder monotonicity), `AdminCommandHandler.test.ts`
  (6 cases), and the rewritten `ModerationCommandHandler.test.ts`.

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
