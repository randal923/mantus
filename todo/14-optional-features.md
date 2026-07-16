# Remaining Canary systems and client polish

These systems may follow the first secure playable loop, but every
player- or operator-visible system present in the pinned Canary baseline is
required for parity. “Later” is implementation order, not optional final
scope.

## World and character content

- [ ] Minimap discovery, markers, floor navigation, and server/world-version
  invalidation.
- [ ] Outfit/addon unlocks and outfit selection validated against server-owned
  entitlements.
- [ ] Mount ownership/selection, speed, and rendering.
- [ ] Beds, offline/exercise training, stamina, blessings, and regeneration
  with exact persistence and abuse-safe timing.
- [ ] Bestiary, bosstiary, charms, prey, hunting tasks, boosted creatures/
  bosses, trackers, and their combat/loot/experience modifiers.
- [ ] Imbuements, item classification/tiering, Exaltation Forge, forge history,
  dust/slivers/cores, influenced/fiendish monsters, and all atomic resource
  conversions.
- [ ] Wheel of Destiny, gems, revelation perks, vocation spell modifications,
  weapon proficiency, and animus mastery.
- [ ] Cyclopedia character/map/house/item/monster views, achievements, titles,
  badges, attached effects, and authorized tracker projections.
- [ ] Reward bosses/chests, quick loot and loot containers, supply stash,
  daily rewards, reward calendars/streaks, and store currency/content.
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
