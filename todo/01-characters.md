# Characters and saved world entry

Depends on [`00-foundations.md`](00-foundations.md). This replaces the current
free-form join name and binds every live game session to an account-owned,
persisted character.

## Database and domain model

- [ ] Add a `characters` migration with an immutable id, `account_id` foreign
  key, display name, normalized name, vocation, level/experience, health/mana,
  capacity, position x/y/z, direction, outfit fields, town/temple id,
  `created_at`, `updated_at`, `last_login_at`, and an optimistic version.
- [ ] Make normalized character names globally unique and enforce a bounded
  number of characters per account in the database transaction as well as the
  service.
- [ ] Define explicit `Character`, `CharacterSummary`, `CreateCharacterInput`,
  and `CharacterSaveSnapshot` types. Do not reuse the public creature
  projection as the persistence model.
- [ ] Store outfit palette indexes and an allowed look type, not arbitrary RGB
  or client-claimed unlocks.
- [ ] Keep inventory, skills, quests, storage, conditions, and other expanding
  state in later normalized migrations rather than a mutable JSON character
  blob.

## Protocol and server flow

- [ ] Replace the free-form `join` packet with character-list,
  create-character, select-character, and delete/rename flows as needed.
- [ ] Define each zod message in `protocol/` first, with maximum byte size and
  a per-connection rate expectation.
- [ ] Derive `account_id` from the authenticated session. Never accept an
  account id or owner id in a character intent.
- [ ] Validate names server-side: normalized uniqueness, length, allowed
  characters/spacing, reserved names, and impersonation policy.
- [ ] Let the server choose starter vocation options, stats, outfit ownership,
  town, and spawn. The client sends selections only from advertised options.
- [ ] Re-check character ownership during selection, then atomically claim the
  one-live-session-per-character slot and kick/reject the older session.
- [ ] Validate saved position against the current map on login. Fall back to a
  configured temple position when the tile is missing, blocked, or invalid.
- [ ] Send only the selected character's exact private stats; list responses
  contain summaries only.

## Persistence lifecycle

- [ ] Add a `CharacterStore` interface and `PgCharacterStore` implementation
  with parameterized queries and deliberate errors.
- [ ] Load a complete player aggregate once while entering the world and lock
  that character against concurrent online loads.
- [ ] Mutate the in-memory player synchronously inside ticks. Queue immutable,
  versioned save snapshots after the mutation; never await a database write in
  the shared-state mutation.
- [ ] Save on meaningful dirty-state intervals, clean logout, and shutdown;
  retry transient failures with a cap and expose a metric for unsaved players.
- [ ] Prevent an older async save from overwriting a newer position/stats
  version.
- [ ] Do not persist item ownership or economy changes through this snapshot
  path. Those require their own atomic transactions and audit entries.

## Client

- [ ] Add a character selection screen after authentication with loading,
  empty, failure, reconnect, and selected states.
- [ ] Add a create-character form driven by server-provided vocation/outfit
  options and accessible validation messages.
- [ ] Remove hard-coded player outfit/name and random color choices from world
  entry; render the selected saved character.
- [ ] Make status UI consume the server's own-player projection instead of
  Storybook values.

## Planned file surface

- Protocol: `protocol/src/character.ts`, `protocol/src/messages.ts`.
- Server: `server/db/migrations/002_characters.sql`,
  `server/src/character/Character.ts`, `server/src/character/CharacterStore.ts`,
  `server/src/character/PgCharacterStore.ts`,
  `server/src/character/CharacterService.ts`,
  `server/src/session/CharacterSessionRegistry.ts`.
- Client: `client/components/character/CharacterSelectScreen.tsx`,
  `CharacterList.tsx`, `CharacterListItem.tsx`, `CreateCharacterForm.tsx`.
- Modify the existing connection/session, player construction, app routing,
  and own-player state files rather than introducing a parallel game flow.

## Required tests

- [ ] Two accounts racing to create the same normalized name produce one row.
- [ ] A user cannot list, select, rename, or delete another account's character.
- [ ] A forged starting position, stats, outfit, or vocation is ignored/rejected.
- [ ] Two connections selecting one character leave exactly one live session.
- [ ] A stale save cannot roll a character back after a newer tick snapshot.
- [ ] Invalid saved positions recover to the configured temple safely.
- [ ] Reconnect restores position, direction, outfit, and private stats without
  leaking another character's data.

[Back to overview](README.md)
