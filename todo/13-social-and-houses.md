# Parties, guilds, houses, and social systems

These features depend on stable character ids, chat, combat/PVP policy, and the
atomic item/economy core. Implement independently in small migrations and state
machines rather than one large social subsystem.

## Parties

- [ ] Add invite/join/leave/kick/leadership and shared-experience intents with
  server-derived character/party ids, membership checks, limits, and rates.
- [ ] Define visibility/status sharing and experience eligibility by range,
  floor, level spread, combat contribution, and activity.
- [ ] Re-check party membership/eligibility when a kill reward executes.

## Guilds

- [ ] Add durable guild, rank, membership, invitation, MOTD, and permission
  tables with normalized unique names and explicit role capabilities.
- [ ] Implement create/invite/accept/remove/promote/disband as authorized
  transactions; handle concurrent membership/name races in the database.
- [ ] Add guild channels only through the chat membership/permission path.

## PVP policy

- [ ] Decide world type and define skull/unjustified kill, protection level,
  secure mode, party/guild exceptions, combat lock, and death consequences.
- [ ] Enforce all PVP policy during combat execution and persist/audit sanctions
  where required. Client indicators are projections only.

## Houses

- [ ] Import house ids, tile membership, entrances, towns, and rent metadata from
  the versioned map/content inputs.
- [ ] Add durable owner/tenant/guest/access-list/rent state and an explicit
  atomic ownership transfer/auction path.
- [ ] Authorize doors, beds, item placement/removal, invitations, and eviction
  server-side. Eviction moves items transactionally to a safe depot/inbox; it
  must never copy then delete them.
- [ ] Audit ownership, rent, auction, and mass item movement.
- [ ] Run rent, auction expiry, and eviction from durable idempotent schedules;
  do not depend on a daily server save or restart to advance them.

## Other social services

- [ ] VIP/friends and presence with privacy/ignore rules.
- [ ] Highscores from bounded read models, not unrestricted game-state queries.
- [ ] Mail/inbox integrated with the item ownership model.
- [ ] Player reports, moderation notes/actions, mutes, kicks, and bans with
  authorization and audit logging.

## Planned file surface

- Feature-local migrations and `server/src/party/`, `guild/`, `pvp/`, `house/`,
  `social/`, and `moderation/` directories, one main export per file.
- Corresponding bounded protocol intents/projections and focused client panels.

## Required exploit tests

- [ ] Party membership/reward races cannot double-award experience.
- [ ] Guild permission and concurrent membership/name races fail safely.
- [ ] PVP restrictions cannot be bypassed with stale party/guild state.
- [ ] House sale/eviction/rent races conserve every item and gold unit.
- [ ] House schedules run once across continuous uptime and crash/restart
  boundaries without requiring a global-save event.
- [ ] Presence, access lists, reports, and moderation data are not over-shared.

[Back to overview](README.md)
