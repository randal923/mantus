# VIP, highscores, mail, and moderation

Part of [`14-social-and-houses`](14-social-and-houses.md). Independent small
services; each can be its own PR.

## Other social services

- [ ] Match pinned VIP/friends, VIP groups/icons/descriptions, presence, and
  privacy/ignore rules, friend-system actions, typing state, leader/member
  finder visibility, and exiva restrictions.
  - Done 2026-07-19: character-scoped VIP list (20 free / 100 premium entries,
    description/icon/notify-on-login per entry), live presence pushes via a reverse
    watcher index, private lists (presence only revealed for names on your
    own list), VipPanel client UI. (Migration `020_social.sql`,
    `server/src/social/`, `protocol/src/vip.ts`.)
  - Updated 2026-07-23: the client presents this as the full-height Friends
    panel with Party access and add-friend dialog; entries now include the
    server-projected level and vocation. The durable relationship remains the
    existing one-way private VIP entry, not a reciprocal friend request.
  - Deferred: reciprocal friend requests/acceptance, VIP groups, typing state,
    finder visibility, exiva
    restrictions (no exiva spell exists), ignore lists (client-side in
    pinned Tibia; nothing server-side yet).
- [x] Match pinned highscore categories and filters through bounded read models,
  not unrestricted game-state queries. (9 categories from persisted
  progression, vocation filter, LIMIT 50 / max 1000 rows deep, 10-min
  cache, fixed parameterized queries; HighscoresModal client UI. GM
  exclusion pending a staff flag — none exists in the schema yet.)
- [x] Mail/inbox integrated with the item ownership model. (Verified the
  existing 11c flow end-to-end; added the missing exploit tests: mail
  delivery-key replay idempotency and the two-racing-sends dupe race, in
  `PgDepotStore.integration.test.ts`. Note: send-mail has no time-based
  rate limit beyond the per-session mutex.)
- [x] Player reports, moderation notes/actions, mutes, kicks, and bans with
  authorization and audit logging. (Migration `021_moderation.sql`,
  `server/src/moderation/`; durable mutes enforced across say/private/
  party/guild chat at execution, spam auto-mute 5·n² escalation gating all
  channels, bans reuse `accounts.banned_until` + kick live sessions in the
  same action, every action writes a `moderation_actions` row in the same
  tx; `/report <name>` player reports with 1/min + 20/day server-side
  limits. Gap: actions only reachable via dev-gated GM commands until the
  production admin path (todo 17d) exists.)
- [ ] Include pinned achievements, titles, badges, namelocks, and public
  character-information projections, livestream/casting, reports, and bug
  reports in the appropriate social/profile model.
  - Done: player reports (above). Deferred: achievements, titles, badges,
    namelocks (enum value reserved in `021_moderation.sql`), public
    character-info projections, livestream/casting, bug reports.

## Planned file surface

- Feature-local migrations and `server/src/social/` and
  `server/src/moderation/` directories, one main export per file.
- Bounded protocol intents/projections and focused client panels.

## Required exploit tests

- [x] Presence, access lists, reports, and moderation data are not over-shared.
  (`social/VipService.test.ts`, `PgSocialStores.integration.test.ts`)
- [x] Moderation actions are authorized, audited, and target-validated.
  (`moderation/ModerationCommands.test.ts`,
  `PgModerationStore.integration.test.ts`)
- [x] Highscore queries stay bounded and expose no private character state.
  (`social/HighscoreService.test.ts`)

[Back to overview](README.md)
