# Todo 10 — Remaining Canary systems

**Features 68†–69†, 72–73, 77, 79–81, 84–86.** Later in order but **not
optional in final scope**. Shipped cores: minimap with markers/click-to-walk,
account UI settings with reset/sync, bestiary/bosstiary, Wheel core +
passive/augment combat wiring, Gem Atelier, the Mantus Store slice,
outfits/mounts complete (entitlements, window, mounted rendering; unlock
sources ride with Features 43/67/quests — each calls
`OutfitService.grantOutfit`), prey and hunting tasks complete server+client
(74/75, 2026-07-26; wildcard/point *sources* ride with Features 43/80/84),
the blessing data layer, and — 2026-07-26 — boosted creatures/bosses with
kill trackers, boss slots, and the reward-boss flag (76), imbuements +
tiers + the Exaltation Forge with influenced/fiendish monsters (78), weapon
proficiency + animus mastery (82), and the Cyclopedia views (83); see
[done.md](done.md).
**Feature 72 is the highest-leverage unblocker in the whole backlog.**

## Client-only remainders (server + protocol ship)

- [ ] **Feature 68 — Minimap marker editing + walk feedback** → [client](client/feature-68-marker-editing.md)
- [ ] **Feature 69 — Movable chat/battle-list/spell-bar panels** → [client](client/feature-69-movable-panels.md)

## Feature 72 — Beds, sleep, training triggers, blessings, regeneration

The offline/timed systems: one shared abuse surface (clock manipulation),
one fix (server-clock-only durable timers with exact Canary persistence).
Owns the Feature 18 in-world training triggers (engines shipped) and Feature
60's blessing-loss wiring. Unblocks: Feature 32's death stack (todo-6),
Feature 38's 143 bless entries (todo-7), and Feature 26's decay bucket
indirectly. The blessing catalog, both cost curves, and the equipment-loss
table already exist as typed data (`server/src/progression/blessings.ts`).

**Remaining work**

- **Blessings persistence** — `characters.blessings` bitmask column,
  `CharacterStore` load/save, `Player.blessings` reading
  `lossReducingBlessingCount(mask)` instead of the literal 0.
- **Blessing purchase** via bank transaction + audit (charter rule 11;
  economy-relevant — its own PR). Canary uses `removeMoneyBank` (carried
  first, then bank) and refuses while pz-locked outside a PZ — re-check both
  at execution time. The player-facing surface is Feature 38's
  `StdModule.bless` NPC family (todo-7): land persistence + consumption
  first, or co-implement one minimal bless dialogue command.
- **Consumption on death** — feeds Feature 32's item drop, including
  amulet-of-loss and red/black-skull branches from `Blessings.PlayerDeath`;
  apply the loss-reducing count in the death formula and
  `server/src/pvp/PvpHooks.ts`.
- **Beds/sleep** — authorization via `HouseService.canUseHouseTile` at
  execution time; sleep state persisted; offline-regen accrual computed
  server-side on next login.
- **Offline + exercise training in-world triggers only** — statue trigger
  that selects the skill and logs out + durable offline-training bar column +
  transactional login conversion applying `computeOfflineTraining`; exercise
  weapon/dummy loop (charge-consuming, PZ-gated, exhausted, scheduled ticks
  calling `computeExerciseTrainingGain`). The math lives in
  `server/src/progression/offlineTraining.ts` / `exerciseTraining.ts` with
  `rates.offlineTraining`/`rates.exerciseTraining` knobs — do not re-derive.
- **Food/soul regeneration** with exact Canary persistence (soul eligibility
  shipped).

**Tests:** clock manipulation/replay cannot mint stamina, sleep regen, or
training time; blessing purchase races cannot double-charge or double-grant;
offline accrual exactly-once across crash/restart.

## Feature 73 — Charm spending

Charm points are earn-only today; promotion-granted minor charm echoes
persist with no spending surface.

**Remaining:** charm rune table + spend/assign intents (bounded schemas
first) extending `server/src/bestiary/` (points in `BestiaryTracker.ts`);
combat procs rolled in `Combat.ts`/`DamageResolver` with server RNG at
damage execution; balances re-checked at spend execution inside the tick.
**Tests:** spend races cannot double-spend; procs never client-influenced.

## Feature 77 — Bestiary accepted-limitation fixes

**Remaining:** kill credit should also cover no-damage party members under
active shared exp (compute the credit set in `BestiaryHooks.ts` from
`getPartyExperienceShares.ts` — execution-time membership) — the same
widened credit set must then feed hunting-task kills
(`HuntingTaskService.onMonsterKilled` rides the same composite hook); route
`bestiary-action-failed` to both modals client-side; queue a second sheet
request inside the 300 ms cooldown instead of erroring. Also absorbed from
Feature 74 (shipped 2026-07-26): Canary's party-shared prey **loot** boost
(`PARTY_SHARE_LOOT_BOOSTS` summing member percentages with the diminishing
factor) — mantus applies only the corpse owner's improved-loot prey today.
**Tests:** no-damage eligible member credited, ineligible not; client queues
within the cooldown window.

## Feature 79 — Wheel combat wiring (revelation actives + periodic passives)

The passive layer shipped 2026-07-26 (mitigation, leech, dodge, crit, magic
boost, revelation flat damage/healing, Gift of Life, spell grades/augments,
upgraded areas, Beam/Combat/Focus/Runic Mastery, Healing Link, Blessing of
the Grove — see [done.md](done.md)). What remains are the bespoke actives
and the periodic majors:

- **Avatars (all five vocations)** — `uteta res *` casts are unsupported
  catalog entries; need reviewed `playerAction` callbacks in the importer
  (outfit condition lookTypes 1593-1596/1823 for 15 s, 5/10/15 % damage
  reduction before mitigation, crit chance overridden to 100 % with
  +5/10/15 % crit damage, 2 h/1.5 h/1 h cooldown), then catalog regen +
  converter-hash re-pin.
- **Executioner's Throw / Divine Grenade / Spiritual Outburst / Divine
  Empowerment / Drain Body** — procedural revelation spells (chain bounces,
  delayed explosion, tile-field item, leech-vs-debuff interplay). Spiritual
  Outburst and the Monk instants (Guiding Presence, Sanctuary, Ascetic) are
  additionally blocked on the Feature 24 harmony/mantra runtime.
- **Periodic conviction majors** — Battle Instinct, Positional Tactics,
  Ballistic Mastery (2 s recalcs over nearby-monster counts / ammo type),
  Battle Healing (fires on successful challenge). Canary zeroes all majors
  outside fights and in PZs (display-only skills effect) — mirror when the
  majors land.
- **Great Death Beam / Mass Healing / Sharpshooter / Swift Foot / Monk
  augment targets** — their grades and augment rows exist; the spells are
  unsupported catalog entries (Feature 24's disabled-spell bucket).
- **Gem long tail** — momentum (cooldown proc on even seconds in fight),
  the 30 spell-supreme gem augments (`computeGemBonuses` `case "spell"` is
  still a no-op), and `m_modsMaxGrade` (each grade-3 gem mod adds one wheel
  point and one point to every quadrant's stage total).
- **Absorbed from Feature 78 (2026-07-26): transcendence tier proc.** The
  legs-slot chance (quadratic + boots amplification) is computed in
  `playerTierBonuses` but nothing consumes it — the proc grants the
  vocation avatar (7 s outfit + reductions), which is this feature's avatar
  work. Wire `triggerTranscendence` when avatars land.
- **Absorbed from Feature 82 (2026-07-26): spell-facing proficiency
  perks.** `spell-augment` (per-spell damage/crit/cooldown boosts),
  `specialized-magic-level`, and the `skill-percentage-spell-damage/
  -healing` families are stored and selectable but inert
  (`proficiencyPerkEffects` skips them); they belong with this feature's
  spell augment plumbing (`wheelSpellAugments`-style, applied at cast).

**Tests:** avatar reduction/crit verified in damage resolution; majors zero
outside fights; forged intents still change nothing (bonuses only ever read
from `player.wheelBonuses`).

## Feature 80 — Wheel rule gaps (extra point sources)

Temple-gated decreases, offline capacity, capacity-view refresh, and the
boosted skill projection shipped 2026-07-26 (see [done.md](done.md)).

**Remaining:** extra point sources — promotion scrolls (items 43946-43950,
+3/5/9/13/20, unlocked once each; needs store/quest item delivery, Feature
43), the Monk quest bonus (+10 behind the shrine storage count; needs
quests), and hunting-task points (the durable balance ships with Feature 75
since 2026-07-26 — `HuntingTaskService.taskPointsOf(characterId)` /
`character_prey_resources.task_points`; only this wheel-side read is
missing). `getUnusedPoints` must then include them the way Canary's
`getExtraPoints` does (player_wheel.cpp:1931-1963).
**Tests:** point-source grants exactly-once (scroll consumption atomic with
grant).

## Feature 81 — Gem atelier Canary deviations

Five recorded deviations to retire, all in
`server/src/wheel/GemAtelierService.ts`, `rollRevealedGem.ts`,
`GemDropHooks.ts`:

- Carried-gold payment leg atomic with the bank leg (one transaction, ledger
  + audit intact).
- Temple-tile check on reveal at execution time.
- `normal_random` destroy yields (server RNG) instead of uniform.
- Item-ification of gems/fragments only if 8.6-era sprites become available;
  otherwise keep balances and the recorded deviation.
  (The drop-classification deviation was retired 2026-07-26 with Feature
  78: `GemDropHooks` now keys on real influenced/fiendish instance states
  and archfoe bosses, not bestiary stars.)

**Tests:** mixed bank+carried payment conserves gold under races; reveal
outside a temple rejected; destroy distribution matches `normal_random`.

## Feature 84 — Rewards and loot QoL

**Remaining:** reward bosses + reward chests (per-player instanced container
on the item-ownership model, following the depot pattern); quick loot +
loot-container assignment (server-validated intents respecting the
memory-first corpse invariant — first touch drives persistence); quick-loot
routing into the supply stash; daily rewards with durable server-clock
streak timers — including Canary's day-3/day-5 prey wildcard grants (1 free
/ 2 premium) through the shipped capped
`PreyService.grantWildcards`/`PreyStore.grantWildcards` path (Feature 74's
only wildcard sources are this and Feature 43's store packs); all grants in
single audited transactions.

**Absorbed residuals (2026-07-26, from Features 76/78):**

- Apply the bosstiary slot loot bonus (`BossSlotService` computes it,
  including the +25 mastery extra) and the boosted-boss +250% roll bonus to
  reward-chest loot rolls when they land (Canary reward_chest.lua:84-101).
- Imbuement astral sources are consumed from carried items only; Canary
  also auto-withdraws the remainder from the supply stash
  (player.cpp:2707-2728) — wire that when quick-loot stash routing lands.

**Tests:** quick-loot races conserve every item under the memory-first
invariant; daily claims exactly-once per day (clock manipulation cannot
advance streaks); reward-chest grants atomic with boss-kill credit.

## Feature 85 — Familiars, hirelings, and summons

**Remaining:** familiars (vocation+level entitlement — same pattern as
Features 70/71 — persistence, combat behavior); hirelings (ownership, house
placement authorized at execution via house ownership, service dialogues
through the NPC system, skills/outfits); player summons (ownership links,
server-side leash/return rules). Hireling economy services go through the
same ACID + audit paths as regular NPCs.

**Tests:** forged control intents for others' summons rejected; hireling
placement/removal follows house ownership at execution (eviction removes
hirelings safely).

## Feature 86 — Modern-systems long tail

Each entry the Feature 89 inventory (todo-1) finds ships as its own bounded
unit: hazard levels, concoctions, encounter/boss difficulty selection
(absorbed from Feature 23), resource balances, podium/show-off objects, and
every other registered modern system. Standard order per unit: protocol
schema + size/rate limits first, server-authoritative execution with
execution-time re-checks, durable state, audits for anything
economy-relevant, per-system exploit tests.

**Absorbed residuals (2026-07-26, from Features 78/82):**

- Imbuement `speed`/`capacity` effects (Swiftness/Featherweight) decay
  correctly but apply no stat yet — needs equip-state plumbing into
  `Player.stepSpeed` and the capacity pipeline (Featherweight is a percent
  of base capacity, Canary player.cpp:3266).
- Vibrancy's PvP-deflect leg (paralysis cloned back onto a non-vibrant
  player attacker, condition.cpp:95-136); the removal-chance roll shipped.
- Inert proficiency perk families with no mantus mechanism yet:
  `bestiary-damage`, `perfect-shot-damage`, `elemental-hit-chance`,
  rune/elemental crit legs, `mana/life-gain-on-hit/-kill`, and Canary's own
  dead types 28-31 (kept inert upstream too).
- Animus mastery earn path: Canary grants it through Soul Pit encounters
  (soul cores drop 5% from fiendish monsters, ondroploot_soul_core.lua);
  mantus ships state/bonus/projection with `AnimusService.grant` as the
  only server-side surface until an encounter system exists.

**Excluded by product decision (2026-07-25): livestream/casting.** Pinned
Canary ships it (`src/creatures/players/livestream/`), deliberately out of
scope here; the Feature 89 inventory classifies it
`excluded-product-decision`, never silently.

[Back to overview](README.md)
