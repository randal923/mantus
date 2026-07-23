# Remaining Canary systems and client polish

These systems may follow the first secure playable loop, but every
player- or operator-visible system present in the pinned Canary baseline is
required for parity. “Later” is implementation order, not optional final
scope.

## World and character content

- [x] Minimap panel: pre-baked terrain tiles in the classic Tibia automap
  palette (`yarn minimap:build`, chained into `map:convert`), NPC/monster/
  player markers from live visibility, NPC tooltips with sold-item categories
  (`yarn npcs:shop-categories`, chained into `npcs:import`), floor
  navigation, zoom, and drag-pan (2026-07-19). Deferred gaps:
  - [ ] Click-to-autowalk from the minimap (needs a server-validated
    walk-to/path intent; none exists yet).
  - [ ] Server-pushed map markers (Canary `0xDD` `addMapMark` equivalent) and
    player-placed waypoint flags with persistence.
  - [ ] Server/world-version invalidation for the baked minimap tiles — the
    client caches PNGs via normal HTTP caching; a map re-convert needs a
    cache-busting version in the manifest.
  - [ ] Town name labels at low zoom (manifest `towns[]` already has the
    data).
- [x] Account-wide UI settings (`accounts.ui_settings` jsonb, migration 022,
  strict bounded `uiSettingsSchema`): minimap panel is draggable (header) and
  resizable (corner grip); layout persists per account via
  `update-ui-settings` with debounced saves (2026-07-19). Deferred gaps:
  - [ ] No "reset layout to default" control; users must drag it back
    (position is clamped on-screen on load, so it can't get lost).
  - [ ] The `ui-settings-updated` ack is ignored by the client, so two live
    sessions on one account don't sync layouts until relogin.
  - [ ] Other panels (chat, battle list, spell bar) are still fixed; the
    settings schema is ready for them.
- [ ] Outfit/addon unlocks and outfit selection validated against server-owned
  entitlements.
- [ ] Mount ownership/selection, speed, and rendering.
- [ ] Beds, offline/exercise training, stamina, blessings, and regeneration
  with exact persistence and abuse-safe timing.
- [ ] Bestiary, bosstiary, charms, prey, hunting tasks, boosted creatures/
  bosses, trackers, and their combat/loot/experience modifiers.
  - [x] Bestiary + bosstiary core: per-player kill tracking
    (`character_bestiary_kills`), stage-gated detail projections, per-kill
    entry-changed pushes, navbar modals with animated sprites — one searchable
    list preloaded at login, category headers as non-clickable dividers
    (`server/src/bestiary/`, `client/components/bestiary/`,
    `content/monsters/bestiary.json` via `yarn bestiary:import`). Remaining
    from this line: charms (points are earned/displayed but unspendable;
    promotion-granted minor charm echoes are persisted but likewise have no
    rune-spending UI/service),
    prey, hunting tasks, boosted creatures/bosses, kill trackers, boss
    slots/loot bonus. Accepted limitations: kill credit = damage participants
    + last hit (Canary also credits no-damage party members under shared exp);
    `bestiary-action-failed` is routed to both modals' sessions client-side;
    opening two creature sheets within the 300ms request cooldown surfaces a
    transient rate-limit error instead of queueing.
- [ ] Imbuements, item classification/tiering, Exaltation Forge, forge history,
  dust/slivers/cores, influenced/fiendish monsters, and all atomic resource
  conversions.
- [x] Wheel of Destiny core (2026-07-20): shared slice/adjacency/bonus tables
  and `validateWheelAllocation`/`computeWheelBonuses` in `protocol/src/wheel*`,
  server `WheelService`/`WheelTracker`/`PgWheelStore` (migration 027,
  `character_wheel.slices smallint[]`), wheel HP/mana/capacity threaded through
  `deriveCharacterStats` at login/runtime/save-snapshot, conviction skill
  boosts applied in `Player.skillLevel`, exploit tests in
  `server/src/wheel/*.test.ts`, and the Tibia-exact client modal
  (`client/components/wheel/`, art + geometry in `client/public/assets/wheel/`
  and `client/lib/wheel/wheelGeometry.ts`, ripped via the otclient wheel
  module). Points are `level - 50`, gated on level 51+ and premium. Deferred
  gaps:
  - [x] Enforce the promoted-vocation requirement in the Wheel and gem atelier
    server gates.
  - [ ] Combat application of mitigation multiplier, life/mana leech, magic
    skill boost, revelation flat damage/healing, conviction instants (Battle
    Instinct etc.), spell grants/augments, and the revelation abilities
    (Gift of Life, Avatars, Beam Mastery, ...). All are computed in
    `WheelBonuses` and shown in the UI but only max HP/mana, capacity, and
    melee/distance/fist skill boosts affect gameplay today.
  - [ ] Point removal is allowed anywhere; Canary restricts decreases to a
    protection zone near a temple. Enforce a PZ/temple check in
    `WheelService.handleSave` when the allocation shrinks.
  - [ ] Promotion scrolls, Monk quest bonus, and hunting-task points.
  - [x] Gem Atelier + Fragment Workshop (Canary-pinned): unrevealed gems drop
    from bestiary/bosstiary kills, reveal/switch-domain/lock/destroy/equip
    actions, global per-mod grades, and vessel resonance gating in
    `server/src/wheel/Gem*` (migration `028_gem_atelier.sql`, protocol
    `gemAtelier*`/`computeGemBonuses`, tabs in
    `client/components/wheel/`). Equipped gems now grant real max HP/mana,
    capacity, elemental resistances (applied in `DamageResolver`), and
    revelation-mastery points; costs are ACID bank debits with ledger +
    audit rows and exploit tests (`GemAtelierService.test.ts`,
    `PgGemStore.integration.test.ts`). Remaining gem gaps:
    - [ ] Supreme spell augments, dodge, crit damage, and gem leech/
      mitigation mods are displayed but combat-inert (same deferred combat
      wiring as the wheel's own leech/mitigation above).
    - [ ] Gold is charged from the bank only (Canary also consumes carried
      gold); gems/fragments are balances, not inventory items (no 8.6
      sprites); drop classification uses bestiary stars/bosstiary in place
      of forge influenced/fiendish/archfoe monsters; reveal has no temple
      restriction; destroy yields roll uniformly instead of
      `normal_random`.
  - [ ] Character-list/offline capacity (`PgItemLocks`) derives capacity
    without the wheel bonus, so offline item-lock checks are slightly
    conservative for wheel users.
  - [ ] Boosted (green) skill display: wheel skill boosts apply in combat via
    `Player.skillLevel` but the skills panel shows base levels only.
- [ ] Revelation perk combat abilities, vocation spell modifications,
  weapon proficiency, and animus mastery (Wheel gems shipped above).
- [ ] Cyclopedia character/map/house/item/monster views, achievements, titles,
  badges, attached effects, and authorized tracker projections.
- [ ] Reward bosses/chests, quick loot and loot containers, supply stash,
  daily rewards, and reward calendars/streaks.
- [ ] Complete store parity. The 2026-07-23 first slice has account-scoped
  Mantus Coins and atomic Premium Time purchases; remaining work is the
  authorized coin-funding path, transferable balances/history, full
  server-owned catalog, inbox delivery, non-premium grants, and refunds.
- [ ] Familiars, hirelings, hireling skills/outfits, summons, and their
  ownership, persistence, dialogue, combat, and return rules.
- [ ] Hazard levels, concoctions, encounter/boss difficulty selection, resource
  balances, podium/show-off objects, livestream/casting, and every other
  registered modern system found by the parity inventory.

## Client polish

- [ ] Lighting/day-night, item/creature light sources, floor darkness, and
  visibility-safe effect rendering.
- [ ] Sound/music with bounded asset loading and accessible volume/mute controls.
- [ ] Hotkeys, action bars, targeting controls, mouse/touch input, context menus,
  drag feedback, and keyboard accessibility. The current settings mapping and
  bottom spell bar are visual previews only: persist validated bindings and
  send bounded cast intents only after the protocol/server execution path exists.
- [ ] Battle list filters, party frames, status icons, combat log, loot channel,
  quest tracker, and notification UX.
- [ ] Generic bounded modal windows and typed answers for Canary interactions
  that are modal-driven, without exposing an open-ended server UI evaluator.
- [ ] Settings persistence, localization, accessibility preferences, and
  responsive panel layout. `GameMenuModal` currently keeps language, volume,
  and hotkey changes only for the lifetime of the open modal.
- [ ] Performance budgets for region streaming, sprite count, animated items,
  effects, UI updates, and low-power/background behavior.
- [ ] Spawn-area atlas sheets are GPU-uploaded eagerly behind the
  entering-world screen (`WorldRenderer.enterWorld`), but sheets that stream
  in later while walking still upload on first draw — a one-frame hitch per
  new sheet. Fix: call `renderer.texture.initSource` inside
  `AssetStore.loadSheet` (needs access to the renderer), or move sheets to
  compressed textures.
- [ ] The "Entering world…" gate waits only for the spawn window's map
  regions and their atlas sheets. Re-entering a long-left area still re-pays
  region fetch + sheet decode mid-walk (`MAX_CACHED_REGIONS = 48` eviction);
  consider prefetching regions adjacent to the walk direction.

## Rules

- [ ] Every gameplay-affecting control sends an intent; its visible cooldown,
  count, entitlement, or limit is not enforcement.
- [ ] Add protocol schemas, size/rate expectations, server revalidation, and
  abuse tests before enabling a new interactive feature.
- [ ] Do not expose full world/bestiary/market/player data simply because a UI
  can display it; define authorized projections.
- [ ] Maintain a generated inventory of pinned advanced systems and protocol-
  facing actions; the parity gate requires zero unimplemented player- or
  operator-visible entries, not merely one representative feature from each
  category.

[Back to overview](README.md)
