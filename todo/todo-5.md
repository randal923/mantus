# Todo 5 — Combat and spells

**Features 22, 24, 26.** The combat core is deep: bounded intents with
execution-time re-checks, server-owned formulas/RNG, all 171 monster-spell
names as reviewed TypeScript, conditions, potions, monster AI, action bars,
spell-words-via-chat, custom combat areas, follow/challenge/aim-at-target/
combat-analyzer, potion monster-say (see [done.md](done.md)). Catalog state:
**236 total / 1 non-content / 235 registered / 169 supported / 66 disabled /
0 ignored formula fields / 47 unreviewed callbacks**, gated with per-owner
budgets in `server/src/combat/loadCanarySpellCatalog.test.ts`.

## Feature 22 — Spell artwork for Blank Rune and Conjure Royal Star

Client-only artwork gap, **blocked externally**: re-verified 2026-07-25
against pinned OTClient `bdea0b23` — `Conjure Royal Star` carries
`icon = ''` / `clientId = 0` and `Blank Rune` has no entry at all. Slots stay
deliberately empty (`getSpellIconArtwork` returns `undefined`); never invent
indices. When a pinned OTClient data update assigns valid indices, map them
via `tools/importOtclientCyclopediaAssets.mjs` and eyeball the two icons.

## Feature 24 — Remaining player support-spell callbacks

Thirteen callbacks shipped 2026-07-25 (food creation, creature illusion,
challenge, chivalrous challenge, divine dazzle, player summons, mentor other,
blood rage, protector, charge, expose weakness, sap strength, holy flash);
catalog moved 153 → 166 → 169 supported with Feature 25's areas. Closing the
rest feeds Feature 26's zero-disabled gate.

**Remaining work**

- **Monk harmony / serene / virtue subsystem** — `utevo nia`, `utamo tio`,
  `utori virtu` / `utito virtu` / `utura tio`. Build as one bounded unit,
  then enable the five spells: a 0..5 harmony charge built by fist hits
  (`buildHarmony`) and spent by Monk mastery spells, heal-on-build/spend,
  `getHarmonyBonus` (`8 + virtue/serene/wheel modifiers`, scaled by
  `2^(harmony-1)`), `CONDITION_SERENE`, the three virtue states, a `MonkData`
  protocol message, a HUD charge display. Canary sources:
  `Player::fillHarmony/buildHarmony/spendHarmony/getHarmonyBonus/setSerene/
  setVirtue` in `src/creatures/players/player.cpp`.
- **Condition types this server lacks** — `utito tempo san` (Sharpshooter)
  and `utamo tempo san` (Swift Foot) need `CONDITION_PACIFIED` /
  `CONDITION_EXHAUST_COMBAT` / per-group `CONDITION_SPELLGROUPCOOLDOWN` plus
  the group-cooldown application path.
- **Divine Empowerment** (`utevo grav san`) — 3×3 owner-tagged
  `ITEM_DIVINE_EMPOWERMENT` tiles decaying after 5 s, gated on a Wheel
  revelation stage (needs the tile-item path below + Features 79–82 in
  todo-10).
- **Field / wall / bomb / item-creating runes** — the 17 still-disabled rune
  definitions (fire/energy/poison field + wall, bombs, magic wall, wild
  growth, animate dead, convince creature, chameleon, desintegrate, destroy
  field). One shared missing capability: *player-driven item/field creation
  on a tile*. The monster side exists (`server/src/combat/CombatFieldManager.ts`),
  so this is a bounded extension — coordinate with Feature 33 (todo-6), which
  makes fields real decaying world items.
- **Mass healing** (`exura gran mas res`) and **mass spirit mend**
  (`exura mas nia`) — area heals with a procedural target callback; Feature
  57 (todo-9) gates their friendly-target selection on party membership.
- Monster-only healing scripts (`458`, `459`, `462`) are non-content for
  players — classify, don't implement.
- Delegated branches: house spells → Feature 109 (todo-9);
  find-person/find-fiend → Feature 65 (todo-9, owns implementing both
  spells); party spells → Feature 57 (todo-9); familiar/avatar → Feature 85
  (todo-10); Wheel/animus → Features 79–82 (todo-10). Monk *attack* spells
  remain blocked on their formulas.

**Implementation**

- Reviewed overlays in `tools/parseCanarySpells.mjs` (`playerCallback` /
  `attributeCondition` / `areaConstant`), regenerating
  `content/spells/canary-spells.json` via `yarn spells:import <checkout>`;
  always update the converter hash in `content/source-manifest.json` or
  `yarn parity:check` fails.
- Callback bodies in `server/src/combat/PlayerSpellActions.ts`, executed via
  `SpellCaster.executeWorldSpell` so resources are spent only when the action
  did something. Conjuring uses the audited single-step path
  (`ItemIntentHandler.conjureForCombat`); player summons share the monster
  summon runtime in `server/src/spawn/SpawnManager.ts` (global cap,
  summonable-only, released with owner).
- Server rolls all RNG and enforces exhaust at execution time.

**Tests:** per-spell seeded-RNG tests in `server/src/combat/Combat.test.ts` /
SpellCaster suites; summon-limit and forged-intent cases are already green.

## Feature 26 — Spell report zero-disabled gate

Classification (non-content vs registered), the parity-budget gate, and the
determinism check shipped; ignored formula fields are locked at zero. The
remaining work list IS the `disabled.byOwner` budget:

| Owner | Disabled | Blocked on |
| --- | --- | --- |
| `07-combat` | 33 | Feature 24 (Monk unit, mass heals, chain/grenade spells) |
| `08c-decay` | 12 | Field/wall/bomb runes — item-creation + decay path (F24 + F33) |
| `14a-parties` | 5 | Party spell callbacks (todo-9, F57) |
| `14d-houses` | 4 | House list/kick spell callbacks (todo-9, F109) |
| `14e-social-services` | 2 | `find person`, `find fiend` (todo-9, F65) |
| `15-optional-features` | 10 | Familiars and avatars (todo-10, F85) |

`unreviewedCallbacks` (47) falls out of the same work. **Gate:** as each
bucket zeroes, drop its `disabled.byOwner` line; when all are gone, replace
the budget with `expect(report.disabled.total).toBe(0)` and
`expect(report.unreviewedCallbacks).toBe(0)`.

[Back to overview](README.md)
