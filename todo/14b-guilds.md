# Guilds

Part of [`14-social-and-houses`](14-social-and-houses.md). Depends on stable
character ids and [`chat`](09-chat.md) channel membership.

## Guilds

- [ ] Add durable guild, rank, membership, invitation, MOTD, and permission
  tables with normalized unique names and explicit role capabilities.
- [ ] Implement create/invite/accept/remove/promote/disband as authorized
  transactions; handle concurrent membership/name races in the database.
- [ ] Add guild channels only through the chat membership/permission path.
- [ ] Implement pinned guild wars, war invitations/ends, kill accounting,
  emblems, online/member lists, rank permissions, and guild message behavior.

## Planned file surface

- Feature-local migrations and `server/src/guild/` with one main export per
  file.
- Bounded protocol intents/projections and a focused client panel.

## Required exploit tests

- [ ] Guild permission and concurrent membership/name races fail safely.
- [ ] Guild channel access follows membership/permission state at execution
  time.
- [ ] Membership and rank data are not over-shared beyond what a member may
  see.

[Back to overview](README.md)
