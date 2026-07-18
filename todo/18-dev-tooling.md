# Dev tooling: GM commands and playtest harness

Dev-only testing infrastructure added 2026-07-18: `DEV_AUTH=1` swaps Supabase
verification for `DevTokenVerifier` (tokens `dev-<name>`), `DEV_COMMANDS=1`
enables in-game GM chat commands (`/i`, `/spawn`, `/goto`, `/level`, `/heal`,
`/where`), and `server/src/playtest/` holds a headless protocol client plus
scenario scripts (`yarn workspace server playtest:banker-relogin`) that boot
the real server against the local docker Postgres (`playtest` database).

## Known gaps

- **`gm-response` is not rendered by the game client.** The protocol message
  exists and the headless playtest client reads it, but the PixiJS client has
  no handler, so a human playing with DEV_COMMANDS=1 gets no visible feedback
  for GM commands. Fix: render `gm-response` in the client chat/console log.
- **GM commands are server-wide, not per-account.** Any player connected to a
  server running DEV_COMMANDS=1 can use them; there is no GM flag on accounts.
  Acceptable while the flag only ever runs locally; if staff commands are ever
  wanted on a shared server, add an account role column and gate per session.
- **GM-spawned monsters idle forever when no player is nearby.** Ad-hoc
  spawns (and regular summons, which share the path) have no spawn slot, so
  the AI detach path skips them and their brains stay registered until they
  die. Harmless at dev scale; fix by letting `detachCreature` also remove
  slotless creatures.
- **`/level` can only raise a level**, because progression only supports
  awarding experience. Lowering would need a dev-only de-level path.
