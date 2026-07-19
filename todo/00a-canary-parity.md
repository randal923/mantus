# Pinned Canary feature-parity ledger

Depends on the provenance and importer safeguards in
[`00-foundations`](00-foundations.md). This ledger is cross-cutting: the
feature-specific TODO files remain the implementation plans, while this file
defines what “complete” means for the pinned Canary baseline.

## Scope contract

The target is full player- and operator-visible gameplay and content parity
with Canary commit `a879c9312e34381e8eedf397b8ed44510698b689` and its pinned
OTServBR Global datapack. Staging work by dependency or enabling a starter
region first is allowed; silently omitting a Canary feature, definition,
callback, formula, placement, or content system is not.

- Reimplement behavior in project-native TypeScript, zod protocol messages,
  Postgres transactions, and the authoritative tick. Never add Canary's C++
  runtime, Lua execution model, binary protocol, database schema, synchronous
  I/O, global mutable architecture, or daily-global-save dependency.
- Security and architecture may be stricter than Canary. Those differences are
  implementation changes, not permission to remove player- or operator-visible
  behavior.
- Examples, tests, development commands, obsolete compatibility shims, and
  server-internal implementation details are not gameplay parity requirements.
  Every other exclusion must be proven non-player- and non-operator-visible and
  recorded in the generated parity report.
- Every imported source entry must have a stable status: implemented and
  verified, blocked by a linked dependency, or classified as non-content.
  Generic `unsupported`, ignored assignments, or unreviewed procedural
  callbacks are temporary backlog states, never the completion state.

## Current audited gaps

- The spell/rune catalog contains 236 parsed entries: 151 are enabled, 84
  registered definitions are disabled, and one example is classified as
  non-content. Every registered spell and rune must become executable.
- The world creature import enables all 83,286 monster and 1,008 NPC
  placements, but its report contains 1,853 definitions with ignored fields or
  procedural callbacks, plus duplicate/ambiguous definitions and invalid
  placements that still require individual resolution.
- Static item numbers and appearance semantics are imported, but the long tail
  of item use, containers, fields, decay, imbuements, forge behavior, world
  actions, and economy integration is incomplete.
- NPC dialogue/actions, quests, raids, global events, and most persistent
  social/modern systems do not yet have full project-native runtimes.

## Required parity workstreams

- [x] Maintain a machine-readable source inventory covering Canary XML, Lua
  registrations, map/spawn content, item definitions, protocol-facing
  gameplay systems, and persistent player/world systems. CI must detect source
  entries that disappear from the inventory or lack an owner TODO.
- [ ] Complete map, movement, zones, floor transitions, teleports, diagonal
  movement, pushing, and every registered movement/world action through
  [`02-map-and-movement`](02-map-and-movement.md) and
  [`12-world-actions`](12-world-actions.md).
- [ ] Complete every monster/NPC definition, placement field, behavior,
  callback, summon, voice, loot link, bestiary/bosstiary field, forge/reward
  classification, and spawn rule through
  [`04-creatures-spawns-and-ai`](04-creatures-spawns-and-ai.md) and
  [`10-npcs`](10-npcs.md).
- [ ] Complete every item attribute and registered item action, including
  containers, depot/inbox/mail/stash, readable/writeable items, food/fluids,
  fields, decay/transforms, beds, rewards, quick loot/loot containers, browse/
  seek/parent-container navigation, inspection, wrapping, hotkey equip,
  imbuements, forge tiers, and equipment effects through
  [`05-items-and-inventory`](05-items-and-inventory.md),
  [`08c-decay`](08c-decay.md), and [`11-economy`](11-economy.md).
- [ ] Complete every vocation/promotion, skill and magic curve, regeneration,
  stamina, soul, offline/exercise training, blessings, death loss, and
  progression modifier through [`06-progression`](06-progression.md) and
  [`08b-player-death`](08b-player-death.md).
- [ ] Enable every registered spell and rune with its exact requirements,
  formulas, areas, callbacks, conjuring, conditions, fields, summons, party,
  familiar, house, and support behavior through [`07-combat`](07-combat.md).
- [ ] Complete corpse, loot, reward-chest, quick-loot, kill attribution,
  experience sharing, reward-boss, and player-death behavior through
  [`08-death-loot-and-decay`](08-death-loot-and-decay.md).
- [ ] Complete Canary speech modes, channels, private messaging, NPC speech,
  commands/talkactions, mute/ignore behavior, and channel permissions through
  [`09-chat`](09-chat.md), NPC, social, and admin TODOs.
- [ ] Complete every NPC dialogue, shop, travel route, quest/storage gate, and
  procedural action as reviewed TypeScript through [`10-npcs`](10-npcs.md).
- [ ] Complete bank, shops, depot/inbox/mail/stash, player trade, market,
  escrow, store currency/content, and all associated history through
  [`11-economy`](11-economy.md) and the advanced-systems backlog.
- [ ] Complete all registered actions, movements, creature events, and
  map-scripted interactions through [`12-world-actions`](12-world-actions.md);
  global events, raids, and daily schedules through
  [`13-raids-and-world-events`](13-raids-and-world-events.md); and all quest
  lines, storages, and rewards through [`20-quests`](20-quests.md).
- [ ] Complete parties/analyzers/shared experience, guilds/wars, PVP/skulls,
  houses/auctions/rent/access lists, VIP groups, highscores, reports, and
  moderation, friend/finder systems, typing/presence, and exiva privacy through
  [`14-social-and-houses`](14-social-and-houses.md).
- [ ] Complete outfits/addons, mounts, familiars, hirelings, achievements,
  titles, badges, attached effects, bestiary, bosstiary, charms, prey, hunting
  tasks, boosted creatures/bosses, daily rewards, Cyclopedia, supply stash,
  imbuements, forge, Wheel of Destiny/gems, weapon proficiency, animus mastery,
  hazards, concoctions, encounters/boss difficulty, podium/show-off systems,
  livestreaming, modal-driven interactions, and other pinned Canary systems
  through [`15-optional-features`](15-optional-features.md).
- [ ] Provide project-native client controls and authorized projections for
  every implemented player-facing system. Absence of Canary's binary protocol
  or exact window layout does not excuse an unreachable server feature.

## Completion and release gates

- [ ] Generated parity reports contain zero unimplemented registered gameplay
  definitions, zero unreviewed procedural callbacks, and zero silently ignored
  gameplay fields. Every non-content classification includes a stable reason.
- [ ] Each workstream has representative Canary fixtures plus aggregate count
  checks so a later import cannot silently reduce coverage.
- [ ] [`17h-testing-and-release-gates`](17h-testing-and-release-gates.md)
  blocks a parity release while any ledger entry is unsupported, dependency
  links are stale, or the pinned source inventory and generated outputs differ.

[Back to overview](README.md)
