# Optional content and client polish

These are valuable but do not block the first secure playable loop. Promote an
item into an earlier feature file if the initial game design requires it.

## World and character content

- [ ] Minimap discovery, markers, floor navigation, and server/world-version
  invalidation.
- [ ] Outfit/addon unlocks and outfit selection validated against server-owned
  entitlements.
- [ ] Mount ownership/selection, speed, and rendering.
- [ ] Beds/offline regeneration, training, stamina, blessings, charms, and
  imbuements only after their persistence/economy abuse cases are specified.
- [ ] Modern systems such as prey, bestiary, task trackers, reward bosses,
  cyclopedia, achievements, daily rewards, and store content only when the core
  loop is stable.

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

[Back to overview](README.md)
