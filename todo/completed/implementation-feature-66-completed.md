# Feature 66 — completed

Social-services hardening, from
[implementation-feature-66.md](../implementation-feature-66.md).

Cross-links: [todo-15.md](../todo-15.md), [todo-18.md](../todo-18.md).

---

## 2026-07-25 — Staff flag, mail rate limit, production moderation surface

**Problem.** Three recorded caveats: highscores listed staff characters, mail
had no time-based limit, and moderation actions were reachable only through
the dev-only GM handler.

**What changed.**

*Staff exclusion.* `accounts.is_staff` (migration `050_staff_accounts.sql`)
plus an anti-join in every highscore query — the boards *and their counts*,
so page math stays honest. It is one boolean rather than a per-character
opt-out so a staff account cannot forget one of its characters; when Feature
96 lands its role column, derive this from it instead of keeping two truths.

*Mail rate limit.* Mirrors the `/report` limiter: a per-session interval in
`DepotOperationRunner` plus a **durable daily cap counted inside the send
transaction** (`countRecentMailQuery` over `inbox_deliveries`). The durable
half is what matters — a reconnecting client gets a fresh session but not a
fresh quota.

*Production moderation.* `ModerationCommandHandler` exposes the same audited
`ModerationService` actions on a real server, authorized from the session's
own account staff flag — never from anything the message names (charter rule
9). A non-staff session is not refused, it is *ignored*: the line falls
through to ordinary speech, so the command set is not discoverable by probing.
Feature 96's admin console routes here; this adds no game logic of its own.

**Files touched.**
`server/db/migrations/050_staff_accounts.sql`,
`server/src/social/sql/{highscoreByExperienceQuery,highscoreByMagicQuery,highscoreBySkillQuery,countHighscoreCharactersQuery,countHighscoreSkillQuery}.ts`,
`server/src/{AccountStore,PgAccountStore}.ts`,
`server/src/depot/{DepotOperationRunner,DepotMailOps,DepotStore}.ts`,
`server/src/depot/sql/countRecentMailQuery.ts`,
`server/src/moderation/ModerationCommandHandler.ts`,
`server/src/chat/ChatHandler.ts`, `server/src/GameServer.ts`,
`protocol/src/depot.ts`.

**How it was verified.** `ModerationCommandHandler.test.ts` — staff sessions
run every action, a non-staff session's identical lines are neither consumed
nor answered, malformed arguments never reach the service, and ordinary speech
and other slash commands are left alone. `PgSocialStores.integration.test.ts`
— a staff account's character is absent from experience, magic, and skill
boards and from their counts. `PgDepotStore.integration.test.ts` — a send past
the daily cap is refused inside the transaction and the item never moves.

**Residual risk.** The staff flag has no operator tooling to *set* it yet
(direct SQL until Feature 96). Highscore exclusion is by account, so a staff
member's non-staff alt account still ranks — which is the intended behaviour.
