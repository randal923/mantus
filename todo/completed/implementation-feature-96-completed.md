# Feature 96 — completed sub-work

Feature 96 (role-authorized admin tooling) is part of
[Todo 18 — Operations, observability, and security](../todo-18.md). Cross-links:
[implementation-feature-96.md](../implementation-feature-96.md) ·
[todo-18.md](../todo-18.md).

---

## 2026-07-25 — Account roles, per-capability gating, and the admin surface

**Problem.** A full moderation runtime already existed — `ModerationService`
enqueues through the tick and writes a `moderation_actions` row in the same
transaction that changes state — but nothing could authorize it in production.
The only two gates were `DEV_COMMANDS=1` (never enabled on a real server, and
server-wide rather than per account) and the coarse `accounts.is_staff` boolean
from migration 050. `is_staff` is one bit: a tutor who may calm chat could also
ban. There was also no way to *set* it except direct SQL, which
[`TODO.md`](../../TODO.md) recorded as an accepted gap owned by this feature.

**What changed.**

- `server/db/migrations/054_account_roles.sql` — an `account_role` enum
  (`player` / `tutor` / `gamemaster` / `admin`) and a `role` column on
  `accounts`, backfilled so every previously-staff account becomes a
  `gamemaster` and keeps exactly the reach it had. `is_staff` is **dropped and
  re-added as a generated stored column** (`role <> 'player'`), so the two
  cannot drift — migration 050's own note asked for exactly this. Every
  highscore query and the partial index keep working untouched. Verified: the
  database now rejects `UPDATE accounts SET is_staff = true` outright.
- `server/src/auth/AccountRole.ts` — the capability model. Commands name the
  capability they need (`moderate.mute`, `moderate.ban`, `world.teleport`, …)
  rather than testing a role rank, so widening one role never silently widens
  another. `hasCapability` **fails closed**: an unknown role string — a row
  written by a newer server or by hand — grants nothing.
- `ModerationCommandHandler` gates each command on its own capability instead
  of `isStaff`. A tutor may `/mute` and `/note`; `/kick`, `/ban`, `/unban` and
  `/namelock` are not consumed at all for them, so the boundary between roles
  is not discoverable by probing any more than the command set is.
- `server/src/admin/AdminCommandHandler.ts` (new) — the production admin
  surface beyond moderation: `/goto <x> <y> [z]`, `/goto <name>`,
  `/bring <name>`, `/inspect <name>`. Mutation is synchronous inside the tick
  through the same `relocateCreature` + `Visibility` primitives ordinary
  movement uses; the audit row is written behind the tick, exactly like
  `ModerationService`. Wired into `ChatHandler` after the moderation handler.
- `moderation_actions` gained `teleport` and `inspect` to its action check plus
  a `detail` jsonb column, so a teleport records its before/after positions and
  an inspection records what was read. Reading privileged player state is
  itself audited — that is how staff access stays reviewable.
- `ModerationStore.recordAdminAction` + implementations in `PgModerationStore`
  (inside the same `runSerializableTransaction` the other actions use, with the
  target resolved by name *inside* the transaction) and
  `MemoryModerationStore`.
- `Account.role` threaded through `AccountStore`, `PgAccountStore` (fail-closed
  parse) and `InMemoryAccountStore`.

**Files touched.** New: `server/db/migrations/054_account_roles.sql`,
`server/src/auth/AccountRole.ts`, `server/src/auth/AccountRole.test.ts`,
`server/src/admin/AdminCommandHandler.ts`,
`server/src/admin/AdminCommandHandler.test.ts`,
`server/src/moderation/sql/insertAdminActionQuery.ts`. Modified:
`server/src/AccountStore.ts`, `server/src/PgAccountStore.ts`,
`server/src/test/InMemoryAccountStore.ts`,
`server/src/moderation/{ModerationStore,PgModerationStore,MemoryModerationStore,ModerationCommandHandler}.ts`,
`server/src/chat/ChatHandler.ts`, `server/src/GameServer.ts`, and the test call
sites that construct `ChatHandler` or an `Account` literal.

**Verification.** `yarn workspace server test` → 1,135 passed (was 1,120; +15
from the new role and admin suites), `yarn typecheck` clean. Migration applied
end-to-end against a scratch Postgres (`054` applies after 001-053), and
verified there that: roles backfill correctly, `is_staff` derives from `role`
and cannot be written independently, `teleport`/`inspect` audit rows with
`detail` insert, and an unknown action is still rejected by the check
constraint.

One real bug was caught by its own test before shipping: `/bring` originally
audited the *moved* character as the actor, so the trail would have claimed the
player teleported themselves. `relocate` now takes an explicit
`actorCharacterId`.

**Residual risk / remaining work.**
- **No operator tooling to assign a role.** The column exists and authorizes
  correctly, but setting it still needs direct SQL. This is strictly better
  than before (the value is now meaningful and one truth), but a real admin
  console or CLI is still owed. Same shape as the `/coins`, `/storerefund` and
  `/raid` dev commands, which should move behind `admin` once such tooling
  exists — Feature 43 and Feature 54 own those.
- **Content/event controls are not yet role-gated.** Feature 96's scope names
  "content/event controls"; `/raid`, `/coins` and `/storerefund` still live in
  the `DEV_COMMANDS`-only `GmCommandHandler`. Moving them needs a decision per
  command about which capability they take (`world.content` and `economy.grant`
  are the obvious additions to `AdminCapability`).
- `admin` and `gamemaster` currently hold identical capabilities. The
  distinction exists for the two bullets above to land against; the monotonicity
  test pins that a promotion never removes a power.
