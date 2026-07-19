# Characters and saved world entry

Depends on [`00-foundations.md`](00-foundations.md). This replaces the current
free-form join name and binds every live game session to an account-owned,
persisted character.

## Database and domain model

- [x] Add a `characters` migration with an immutable id, `account_id` foreign
  key, display name, normalized name, vocation, level/experience, health/mana,
  capacity, position x/y/z, direction, outfit fields, town/temple id,
  `created_at`, `updated_at`, `last_login_at`, and an optimistic version.
- [x] Make normalized character names globally unique and enforce a bounded
  number of characters per account in the database transaction as well as the
  service.
- [x] Define explicit `Character`, `CharacterSummary`, `CreateCharacterInput`,
  and `CharacterSaveSnapshot` types. Do not reuse the public creature
  projection as the persistence model.
- [x] Store outfit palette indexes and an allowed look type, not arbitrary RGB
  or client-claimed unlocks.
- [x] Keep inventory, skills, quests, storage, conditions, and other expanding
  state in later normalized migrations rather than a mutable JSON character
  blob.

## Protocol and server flow

- [x] Replace the free-form `join` packet with character-list,
  create-character, and select-character flows. Rename/delete remain deferred
  product operations and are not required for saved world entry.
- [x] Define each zod message in `protocol/` first, with maximum byte size and
  a per-connection rate expectation.
- [x] Derive `account_id` from the authenticated session. Never accept an
  account id or owner id in a character intent.
- [x] Validate names server-side: normalized uniqueness, length, allowed
  characters/spacing, reserved names, and impersonation policy.
- [x] Let the server choose starter vocation options, stats, outfit ownership,
  town, and spawn. The client sends selections only from advertised options.
- [x] Re-check character ownership during selection, then atomically claim the
  one-live-session-per-character slot and kick/reject the older session.
- [x] Validate saved position against the current map on login. Fall back to a
  configured temple position when the tile is missing, blocked, or invalid.
- [x] Persist a validated temple fallback with optimistic versioning so an
  invalid saved position is repaired instead of reconsidered on every login.
- [x] Set `last_login_at` only after the character is claimed and successfully
  enters the world; a failed spawn or stale selection must not count as a
  login.
- [x] Send only the selected character's exact private stats; list responses
  contain summaries only.
- [x] Replace `client/components/navigation/placeholderCharacter.ts` with real
  server-sent character stats. The placeholder has been removed; the in-game
  navigation and HUD render only the selected character's projection.

## Persistence lifecycle

- [x] Add a `CharacterStore` interface and `PgCharacterStore` implementation
  with parameterized queries and deliberate errors.
- [x] Load a complete player aggregate once while entering the world and lock
  that character against concurrent online loads.
- [x] Mutate the in-memory player synchronously inside ticks. Queue immutable,
  versioned save snapshots after the mutation; never await a database write in
  the shared-state mutation.
- [x] Save on meaningful dirty-state intervals, clean logout, and shutdown;
  retry transient failures with a cap and expose a metric for unsaved players.
- [x] Prevent an older async save from overwriting a newer position/stats
  version.
- [x] Do not persist item ownership or economy changes through this snapshot
  path. Those require their own atomic transactions and audit entries.

## Client

- [x] Add a character selection screen after authentication with loading,
  empty, failure, reconnect, and selected states.
- [x] Show the server-derived free/premium account status in character
  selection, including rounded-up remaining premium days while active.
- [x] Add a create-character form driven by server-provided vocation/outfit
  options and accessible validation messages.
- [x] Remove hard-coded player outfit/name and random color choices from world
  entry; render the selected saved character.
- [x] Make status UI consume the server's own-player projection instead of
  Storybook values.
- [x] Colorize character-selection and HUD portraits from the saved outfit
  palette indexes instead of displaying only the look type's base sprite.

## Planned file surface

- Protocol: `protocol/src/character.ts`, `protocol/src/messages.ts`.
- Server: `server/db/migrations/003_characters.sql`,
  `server/src/character/Character.ts`, `server/src/character/CharacterStore.ts`,
  `server/src/character/PgCharacterStore.ts`,
  `server/src/character/CharacterService.ts`, `server/src/CharacterHandler.ts`,
  `server/src/SessionRegistry.ts`.
- Client: `client/components/characters/CharacterSelectScreen.tsx`,
  `CharacterList.tsx`, `CharacterListItem.tsx`, `CreateCharacterForm.tsx`.
- Modify the existing connection/session, player construction, app routing,
  and own-player state files rather than introducing a parallel game flow.

## Required tests

- [x] Add a PostgreSQL-backed race test proving two accounts creating the same
  normalized name produce exactly one row.
- [x] Add a PostgreSQL-backed race test proving concurrent creates at the
  account slot limit cannot exceed the configured maximum.
- [x] A user cannot list or select another account's character.
- [ ] When rename/delete flows are added, prove a user cannot rename or delete
  another account's character.
- [x] A forged starting position, stats, outfit, or vocation is ignored/rejected.
- [x] Two connections selecting one character leave exactly one live session.
- [x] Add a PostgreSQL-backed test proving a stale save cannot roll a character
  back after a newer tick snapshot.
- [x] Invalid saved positions recover to the configured temple safely.
- [x] Reconnect restores position, direction, outfit, and private stats without
  leaking another character's data.

[Back to overview](README.md)
