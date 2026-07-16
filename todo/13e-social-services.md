# VIP, highscores, mail, and moderation

Part of [`13-social-and-houses`](13-social-and-houses.md). Independent small
services; each can be its own PR.

## Other social services

- [ ] VIP/friends and presence with privacy/ignore rules.
- [ ] Highscores from bounded read models, not unrestricted game-state queries.
- [ ] Mail/inbox integrated with the item ownership model.
- [ ] Player reports, moderation notes/actions, mutes, kicks, and bans with
  authorization and audit logging.

## Planned file surface

- Feature-local migrations and `server/src/social/` and
  `server/src/moderation/` directories, one main export per file.
- Bounded protocol intents/projections and focused client panels.

## Required exploit tests

- [ ] Presence, access lists, reports, and moderation data are not over-shared.
- [ ] Moderation actions are authorized, audited, and target-validated.
- [ ] Highscore queries stay bounded and expose no private character state.

[Back to overview](README.md)
