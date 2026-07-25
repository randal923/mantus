# Todo 9 — Characters, social, and houses

**Features 2, 57, 58, 59, 62†, 65, 67.** Almost everything here shipped:
parties with analyzer/finder/invite-shields, guilds with wars/emblems/bank,
the pinned PVP policy with pvp-zone tiles and the combat-logout linger
window, houses with auctions/access-lists/guildhalls/polish, VIP/friends
with requests and groups, moderation hardening, and the profile projection
stack (see [done.md](done.md)). † = client-only remainder.

## Feature 2 — Character rename/delete flows with authorization tests

No longer purely conditional: Feature 67 shipped namelock **enforcement**
(world entry refused with `character-namelocked`), so nothing can clear a
namelock until rename exists. Delete remains a product decision.

**Implementation:** zod messages in `protocol/src/character.ts` (max size +
rate first); handle in `server/src/character/CharacterService.ts` deriving
the account from the session, never the body; re-check ownership at
execution time inside the tick; one DB transaction; rename preserves
globally unique normalized names. (`tools/deleteCharacter.mjs` is a dev
script, not a player flow.)

**Tests** (alongside `PgCharacterStore.integration.test.ts`): cross-account
rename rejected; cross-account delete rejected; two racing renames to one
normalized name leave exactly one winner.

## Feature 57 — Party-aware spells

Invite-pending shields shipped. **Blocked** on Feature 24's mass-heal /
party-buff spells (todo-5): when they land in
`server/src/combat/SpellRegistry.ts`/`SpellCaster.ts`, friendly-target
selection gates on party membership **re-checked at execution time inside
the tick** — never membership at cast enqueue. Test: a member who left
between cast and resolution is not healed.

## Feature 58 — Guild bank (remainder)

Balances, deposit/withdraw intents, points/level projection shipped.

**Remaining work**

- **Per-rank withdrawal permission** — withdrawal is leader-only; Canary
  gates on a rank capability, which needs a permission model on
  `guild_ranks`.
- **Run the four durable integration cases** against Postgres
  (`yarn workspace server test:integration` — they are written but unrun).
- Client deposit/withdraw controls →
  [client backlog](client/feature-58-guild-bank-ui.md).

Consumed by guildhall purchase/rent (shipped).

## Feature 59 — Combat-logout completion

The linger window shipped (`LingeringPlayers.test.ts` pins the bookkeeping).

**Remaining work**

- **End-to-end playtest scenario** in `server/src/playtest/scenarios`: two
  headless clients fight, the killer disconnects before the victim dies,
  frag + skull asserted against the killer afterwards.
- **Item cache during the linger window** — the cache detaches with the
  session, safe only because player corpses drop nothing today; when
  Feature 32 (todo-6) drops items, the lingering entity must keep its
  inventory attached so a death inside the window drops loot normally.

## Feature 62 — House per-door access lists (client-only remainder)

`house-set-list` accepts `kind: "door"` and the server enforces per-door
lists at execution time; only the
[door-list editor](client/feature-62-door-list-editor.md) is missing.

## Feature 65 — Friend-system completion

Reciprocal requests, groups, typing hints, and presence shipped.

**Remaining work**

- **Finder-visibility privacy setting** (absorbed from Feature 56):
  `PartyHandler` consults `finderVisible(characterId)` at query execution
  time, defaulting true — add the per-character privacy setting and wire the
  hook.
- **Exiva restrictions** — blocked: no exiva spell exists yet (todo-5).
- VIP-group management UI →
  [client backlog](client/feature-65-vip-groups-and-typing.md).
- Durable ignore lists → Feature 35 (todo-7) owns them.

## Feature 67 — Profile projections (remainder)

Achievements/titles/badges grant tables, namelock enforcement, character
info, and bug reports shipped server-side.

**Remaining work**

- **Import Canary's full achievement catalog** — today's pinned set covers
  only the grant hooks that exist.
- Namelock rename flow → Feature 2 (above). Livestream/casting → Feature 86
  (todo-10). Cyclopedia display of these projections → Feature 83 (todo-10).
- The whole client surface →
  [client backlog](client/feature-67-profile-ui.md).

[Back to overview](README.md)
