# Todo 9 — Characters, social, and houses

**Features 2, 57, 58, 59, 62†, 65, 109.** Almost everything here shipped:
parties with analyzer/finder/invite-shields, guilds with wars/emblems/bank,
the pinned PVP policy with pvp-zone tiles and the combat-logout linger
window, houses with auctions/access-lists/guildhalls/polish, VIP/friends
with requests and groups, moderation hardening, and the complete profile
stack — projections, the full imported achievement catalog, and the whole
client surface (Feature 67, closed 2026-07-26; see [done.md](done.md)).
† = client-only remainder.

## Feature 2 — Character rename/delete flows with authorization tests

No longer purely conditional: Feature 67 shipped namelock **enforcement**
(world entry refused with `character-namelocked`), so nothing can clear a
namelock until rename exists. Delete remains a product decision. Guard: do
not add an in-game namelock *setter* to moderation before rename ships — a
namelocked character would be dead-ended.

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
- **Fix and re-run the durable integration cases** — first executed
  2026-07-26: three fail with `bank_ledger_amount_check` violations from
  `appendBankLedger` (`PgGuildStore.ts:827`) in the deposit/withdraw
  conservation, racing-withdrawal, and war-stake-escrow tests — the guild
  flows write ledger amounts the 012 constraint rejects (sign convention);
  fix the amounts or the rows, then keep the suite green.
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
- **Exiva spells — owned here** (todo-5 delegates both; transcribed from
  pinned `find_person.lua` / `find_fiend.lua`): `exiva "name"` (Find
  Person, level 8, 20 mana) computes the distance band (<5 beside, <101
  close, <275 far, else very far), octant direction, and z-level relation
  server-side and sends one private text line; staff targets stay
  invisible to non-staff casters. Implementable now on the shipped spell
  infrastructure. `exiva moe res` (Find Fiend, level 25) points at the
  nearest **fiendish** monster with a bestiary-kills difficulty string —
  blocked on Feature 78's fiendish monster states (todo-10); bestiary
  thresholds already ship.
- VIP-group management UI →
  [client backlog](client/feature-65-vip-groups-and-typing.md).
- Durable ignore lists → Feature 35 (todo-7) owns them.

## Feature 109 — House spell words (guest/subowner/door lists and kick)

Owns the four disabled `14d-houses` spells in Feature 26's budget (todo-5).
The House modal shipped as the management surface, but the spell words stay
player-visible parity. All four: support group, level 8, all vocations, 2 s
cooldown, non-aggressive. Transcribed from pinned
`data/scripts/spells/house/`:

- `aleta sio` (House Guest List) / `aleta som` (House Subowner List) —
  standing on a house tile with edit rights for that list opens its editor;
  otherwise cancel + poff.
- `aleta grav` (House Door List) — resolves the door on the tile the caster
  faces (falling back to the caster's own tile) and opens that door's list
  editor. Server enforcement shipped with Feature 62; the editor UI is the
  [door-list editor](client/feature-62-door-list-editor.md).
- `alana sio "name"` (House Kick) — without a name (or naming yourself),
  teleports the caster from inside a house to its exit; with a name, a
  caster standing in a house whose guest list they can edit kicks the named
  player out of the house that player stands in (kick re-validated against
  the target's house).

**Implementation:** enable via the reviewed overlays in
`tools/parseCanarySpells.mjs`; callbacks in
`server/src/combat/PlayerSpellActions.ts` calling the shipped
`HouseService` list/kick/exit operations — authorization re-checked at
execution time inside the tick, list edits through the same validation as
the House modal. Drop the `14d-houses` line from Feature 26's budget when
they enable.

**Tests:** non-owner/non-subowner casts rejected; kick follows current
access state at execution; the door is derived server-side from the
caster's facing, never from a client position.

[Back to overview](README.md)
