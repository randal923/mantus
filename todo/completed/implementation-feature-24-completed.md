# Feature 24 — completed sub-work

Feature 24 is **still open**. Cross-links:
[implementation-feature-24.md](../implementation-feature-24.md) ·
[todo-8.md](../todo-8.md).

---

## 2026-07-25 — Thirteen player-spell callbacks reviewed into TypeScript

**Problem.** An unfinished slice of pinned player spell registrations was
still disabled in the generated catalog (153 supported / 83 unsupported).

**What changed.**

### Catalog pipeline

- `tools/parseCanarySpells.mjs` — two new reviewed-overlay shapes:
  `playerCallback(...)` for spells whose Lua body becomes a TypeScript
  callback (emits `playerAction`, suppresses the *procedural cast* and
  *procedural combat callback* reasons) and `attributeCondition(...)` for
  self-buff / debuff spells that are just a reviewed condition. An overlay can
  also name an `areaConstant`, which is still resolved from the pinned
  `register_spells.lua` tables — used by Sap Strength, whose combat is built
  through a helper the literal-area regex cannot see.
- `content/spells/canary-spells.json` regenerated from the pinned checkout
  (`a879c93`). Provenance (`canaryCommit`, `definitionsSha256`) is unchanged;
  only the reviewed overlay grew. **153 → 166 supported, 83 → 70 unsupported.**
- `content/source-manifest.json` — converter hash for the parser updated.

### Newly executable spells

| Spell | Words | Shape |
| --- | --- | --- |
| Food | `exevo pan` | server-rolled random food, single atomic conjure |
| Creature Illusion | `utevo res ina` | outfit condition from an illusionable monster type |
| Challenge | `exeta res` | challenges every monster in the pinned 3x3 area |
| Chivalrous Challenge | `exeta amp res` | chain: 5 ranged monsters challenged + pulled to melee |
| Divine Dazzle | `exana amp res` | chain: 3 ranged monsters pulled to melee |
| Summon Creature | `utevo res` | player summon under the shared summon limits |
| Mentor Other | `uteta tio` | vocation-specific 60 s buff on one visible player |
| Blood Rage | `utito tempo` | melee 135 %, damage received 115 %, defense disabled |
| Protector | `utamo tempo` | shielding 220 %, damage dealt 65 %, received 85 % |
| Charge | `utani tempo hur` | haste 1.9/40 for 5 s |
| Expose Weakness | `exori moe` | monsters-only, damage received 105 % over the 3x3 circle |
| Sap Strength | `exori kor` | monsters-only, damage dealt 90 % over the 3x3 circle |
| Holy Flash | `utori san` | holy dazzled damage-over-time |

### Server

- `server/src/combat/Spell.ts` — `playerAction` (`PLAYER_SPELL_ACTIONS`) plus
  the new condition fields (`monstersOnly`, the skill/damage/healing
  percentages, `disablesDefense`); `loadCanarySpellCatalog.ts` validates them.
- `server/src/combat/PlayerSpellActions.ts` — the reviewed callback bodies.
  Everything runs synchronously inside the tick after the regular cast
  pipeline has re-validated vocation, level, mana, soul, range and cooldowns;
  each action re-resolves its own targets from live state and returns false
  (so nothing is paid) rather than guessing.
- `server/src/combat/Condition.ts` / `ConditionManager.ts` — Canary's
  `BUFF_DAMAGEDEALT` / `BUFF_DAMAGERECEIVED` / `BUFF_HEALINGDEALT` and
  `DISABLE_DEFENSE`, plus a `fistPercent` skill modifier.
- `server/src/combat/DamageResolver.ts` — the caster's outgoing buff and the
  victim's incoming buff scale the roll before mitigation; `disablesDefense`
  skips the shield/armor block.
- `server/src/spawn/SpawnManager.ts` — `summonForPlayer` (Canary's two-summon
  cap, summonable-only, shared with the monster summon registry) and
  `releaseSummonsOf`, called from `GameServer` on disconnect so an offline
  player can never keep monsters alive.
- `protocol` — `cast-spell` gained a bounded optional `parameter` for the
  spells Canary declares with `hasParams`; spoken casts pass their parameter
  through. New error codes `spell-summon-limit`, `spell-parameter-invalid`.

**Tests.** `server/src/combat/Combat.test.ts` — a challenge reaches only live,
unowned monsters and never a forged one; an unknown illusion name is refused
without spending mana while a valid one applies the outfit; damage buffs scale
the roll. `server/src/spawn/SpawnManager.test.ts` — the player summon cap
holds, unsummonable types and unknown names are refused, and summons are
released with their owner.

**Residual risk / deferred.** See the remaining-work list in
[implementation-feature-24.md](../implementation-feature-24.md). The Monk
harmony / serene / virtue subsystem and the spells that need condition types
this server does not have yet (pacified, per-group spell cooldowns) are
explicitly *not* done. Holy Flash uses a fixed 9 damage rounds where Canary
rolls `math.random(7, 11)` at registration time, because the catalog is
static — a reviewed simplification, not a client-visible one.
