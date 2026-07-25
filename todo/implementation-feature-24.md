# Feature 24 — Remaining player support-spell callbacks

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

Shipped so far (2026-07-25): thirteen callbacks — food creation, creature
illusion, challenge, chivalrous challenge, divine dazzle, player summons,
mentor other, blood rage, protector, charge, expose weakness, sap strength,
holy flash. The catalog moved from 153 to **166 supported / 70 unsupported**.
See the [completed log](completed/implementation-feature-24-completed.md).

## Why

After conjuring, ammunition/enchantment, cure/dispel, light, inventory-food,
and floor-moving spells became executable, an unfinished slice of pinned
player spell registrations remains. Closing it feeds the zero-disabled spell
gate (Feature 26).

## Remaining work

- **Monk harmony / serene / virtue subsystem** — `utevo nia` (Focus Harmony),
  `utamo tio` (Focus Serenity), `utori virtu` / `utito virtu` / `utura tio`
  (the three virtues). Deliberately *not* built as part of the 2026-07-25
  slice: in Canary these spells only fill or spend a resource that nothing
  else here implements. Parity needs the whole unit — a 0..5 harmony charge
  built by fist hits (`buildHarmony`) and spent by the Monk mastery spells,
  the heal-on-build/spend, `getHarmonyBonus` (`8 + virtue/serene/wheel
  modifiers`, scaled by `2^(harmony-1)`), the `CONDITION_SERENE` condition,
  the three virtue states, a `MonkData` protocol message and a HUD charge
  display. Sources: `Player::fillHarmony/buildHarmony/spendHarmony/
  getHarmonyBonus/setSerene/setVirtue` in `src/creatures/players/player.cpp`.
  Build it as its own bounded unit, then enable the five spells.
- **Spells needing condition types this server lacks** — `utito tempo san`
  (Sharpshooter) and `utamo tempo san` (Swift Foot) both apply
  `CONDITION_PACIFIED` / `CONDITION_EXHAUST_COMBAT` / per-group
  `CONDITION_SPELLGROUPCOOLDOWN` alongside their buff. Add those condition
  types (and the group-cooldown application path) first.
- **Divine Empowerment** (`utevo grav san`) — creates a 3x3 patch of
  owner-tagged `ITEM_DIVINE_EMPOWERMENT` tiles that decay after 5 s, and is
  gated on a Wheel revelation stage. Needs the tile-item creation path below
  plus Todo 16 Features 79–82.
- **Field / wall / bomb runes and the item-creating runes** — the 17
  still-disabled rune definitions (`fire`/`energy`/`poison` field and wall,
  the bombs, magic wall, wild growth, animate dead, convince creature,
  chameleon, desintegrate, destroy field). They are blocked on one shared
  capability: *player-driven item/field creation on a tile*. The monster side
  of this already exists (`server/src/combat/CombatFieldManager.ts`, shipped
  with monster-created fields), so this is a bounded extension rather than
  new machinery. Newly identified 2026-07-25; it was not in the original list
  but must be owned somewhere for Feature 26 to reach zero.
- **Mass healing** (`exura gran mas res`) and **mass spirit mend**
  (`exura mas nia`) — area heals with a procedural target callback.
- Monster-only healing scripts registered under `data/scripts/spells/healing`
  (`458`, `459`, `462`) are non-content for players and should be classified
  as such by Feature 26 rather than implemented here.
- Delegated branches (unchanged): house spells → Todo 15 (Features 61–64);
  find-person/find-fiend → Todo 15 (Features 65–66); party spells → Todo 15
  (Features 55–57); familiar/avatar → Todo 16 (Feature 85); Wheel/animus
  branches → Todo 16 (Features 79–82). The Monk *attack* spells
  (`exori pug`, `exori nia`, … ) remain blocked on their formulas and on
  Feature 25's custom areas.

## Implementation

- Reviewed overlays in `tools/parseCanarySpells.mjs`
  (`playerCallback` / `attributeCondition` / `areaConstant`), regenerating
  `content/spells/canary-spells.json` via `yarn spells:import <checkout>`.
  Always update the converter hash in `content/source-manifest.json`
  afterwards or `yarn parity:check` fails.
- Callback bodies in `server/src/combat/PlayerSpellActions.ts`, executed
  through `SpellCaster.executeWorldSpell` so resources are only spent when the
  action actually did something.
- Conjuring reuses the single-step audited item path
  (`ItemIntentHandler.conjureForCombat`); the food roll happens in the tick
  with the seeded `CombatFormula` before the conjure.
- Player summons share the monster summon runtime in
  `server/src/spawn/SpawnManager.ts` (global cap, summonable-only, released
  with their owner).
- All Canary Lua spell callbacks are reimplemented as reviewed TypeScript;
  server rolls all RNG and enforces exhaust at execution time.

## Tests

- Per-spell tests in `server/src/combat/Combat.test.ts` and the SpellCaster
  suites with seeded RNG.
- Summon-limit tests: player summons cannot exceed shared global/per-type
  limits; forged summon intents rejected. ✅

## Dependencies

- Todo 15 (Features 55–57, 61–64, 65–66) and Todo 16 (Features 79–82, 85) for
  delegated branches.
- Challenge/taunt semantics shared with [Feature 23](implementation-feature-23.md).
- Feeds [Feature 26](implementation-feature-26.md) (zero-disabled gate).
