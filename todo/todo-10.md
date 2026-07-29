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
- **Offline training in-world trigger only** — statue trigger that selects
  the skill and logs out + durable offline-training bar column + transactional
  login conversion applying `computeOfflineTraining`. The math lives in
  `server/src/progression/offlineTraining.ts` with the `rates.offlineTraining`
  knob — do not re-derive. (Exercise weapons/dummies shipped; see
  [done.md](done.md).)
- **Exercise training residue** — the house-dummy check only caps trainers
  per dummy tile; Canary also requires the trainer to be inside the same house
  as the dummy, which needs `HouseService` membership at execution time.
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

## Feature 84 — Rewards and loot QoL (remainder)

Reward chests and daily rewards shipped 2026-07-26 (see
[done.md](done.md)), including the bosstiary-slot/boosted loot-bonus
application. What remains is the loot-routing QoL:

- **Loot-container assignment** — durable per-category container
  assignments (`quickLootFilter` categories), server-validated intents
  respecting the memory-first corpse invariant; the sweep then routes per
  category instead of backpack-first.
- **Quick-loot routing into the supply stash** for stowable categories.
- **Imbuement astral stash auto-draw** (absorbed from Feature 78):
  astral sources are consumed from carried items only; Canary also
  auto-withdraws the remainder from the supply stash
  (player.cpp:2707-2728) — wire it when stash routing lands.

**Tests:** quick-loot races conserve every item under the memory-first
invariant; assignment routing honors the durable table at execution time.

## Feature 85 — Familiars, hirelings, and summons

**Remaining:** familiars (vocation+level entitlement — same pattern as
Features 70/71 — persistence, combat behavior); hirelings (ownership, house
placement authorized at execution via house ownership, service dialogues
through the NPC system, skills/outfits); player summons (ownership links,
server-side leash/return rules). Hireling economy services go through the
same ACID + audit paths as regular NPCs.

**Groundwork mapped 2026-07-26 (nothing shipped yet):**

- The five familiar spells (`utevo gran res ven/dru/sac/eq/tio`, level
  200, mana 3000/3000/2000/1000/1500) sit in `canary-spells.json` as
  `supported: false` — enabling them is the importer lane (reviewed
  `playerAction` in `tools/parseCanarySpells.mjs`, catalog regen,
  converter-hash re-pin), the same lane Feature 79's avatars need.
- The familiar monster types (`data-otservbr-global/monster/familiars/`,
  e.g. druid familiar: 20k HP, exp 0, corpse 0, familiar flag, melee to
  −300) are **not** in `world-monsters.json`; the creature import must
  include that directory (regen + re-pin) or a reviewed content file must
  carry them.
- Exact pinned numbers: premium required; blocked while any summon is up
  (`#getSummons() >= 1`); duration 15 min (`60*familiarTime/2`,
  familiarTime 30); cooldown = duration × 2 minus the VIP reduction;
  warnings at T−60 s/T−10 s; death zeroes the remaining time; login
  re-creates with the remainder for premium level-200+; C++ traits:
  PZ entry only while the master has no target, no target acquisition in
  PZ, teleport to master at >15 tiles or any z-diff, walk-through, full
  exp passthrough (no summon halving), master may use potions on it.
- Mantus summon-runtime gaps to close first (mapped in
  `spawn/SpawnManager`): no master link reachable from combat/AI
  (ownership lives in two private maps), `canMonsterAffect` is
  faction-only so a summon has no friend/foe notion of its master, no
  follow/leash (home frozen at the summon tile), summons survive master
  death (only logout releases them), and no runtime NPC creation path
  exists for hirelings (`new Npc` only in `SpawnManager.createCreature`);
  `DialogueAction` has no hireling-service kind. Hireling pinned facts:
  lamp 29432, service ids 1001-1004, dress looktypes 1109-1132, placement
  owner-only inside a house, one per tile, `returnToLamp` to the store
  inbox, `checkHouseAccess` re-lamps on owner change; prices are store
  catalog copy (150/250/900/250/250).

**Tests:** forged control intents for others' summons rejected; hireling
placement/removal follows house ownership at execution (eviction removes
hirelings safely).

## Feature 86 — Modern-systems long tail

Podiums, the imbuement speed/capacity stats, and vibrancy's deflect leg
shipped 2026-07-26; boss/encounter difficulty selection closed as a no-op
(pinned Canary's `parseBossDifficultySelection` drains the packet and does
nothing, protocolgame.cpp:3260-3266). See [done.md](done.md). Each
remaining entry ships as its own bounded unit — protocol schema first,
server-authoritative execution with execution-time re-checks, durable
state, audits where economy-relevant, per-system exploit tests:

- **Hazard system** — zones (Gnomprona `hazard_primal.lua` bounds, max
  level 12), per-player current/max level (Canary keeps them in KV;
  level-up on Primal Menace kill, manual lowering via NPC), party-lowest
  points, and the exact combat legs: +2 % boss damage per point, hazard
  crit +50 % base +0.25 %/point at 7.5 % chance per 2 s, 0.85 % dodge per
  point, +3.5 % exp per point, loot `4 × points`% extra-roll chance with
  the ceil/floor fractional idiom, Primal Pod (0.87 %/point, hatches a
  Fungosaurus, timed 5 % max-HP +500 life drain) and Plunder Patriarch
  (0.025 %/point) spawns; reward bosses exempt. Config defaults
  transcribed from configmanager.cpp:278-289.
- **Concoctions** — the 20 items 36723-36742 (ids verified present in the
  item catalog), 1 h duration / 24 h cooldown, per-concoction durable
  TimeLeft + LastActivatedAt (Canary keeps them in player storages; drain
  online-only in 60 s ticks, survive death/logout, re-apply on login).
  Wiring map per effect: StaminaExtension +60 min stamina instantly;
  KooldownAid clears spell cooldowns; StrikeEnhancement +5 % crit into
  the crit aggregation; WealthDuplex one extra corpse roll
  (`createMonsterCorpse`, party-diminished per
  ondroploot_wealth_duplex.lua); BestiaryBetterment ×2 bestiary kills
  (`BestiaryTracker`); 7 resiliences −8 % absorb legs and 7
  amplifications +8 % dealt legs into `DamageResolver`; CharmUpgrade +5
  charm chance is blocked on Feature 73 (charm procs don't exist yet).
- **Inert proficiency perk families** with no mantus mechanism yet:
  `bestiary-damage`, `perfect-shot-damage`, `elemental-hit-chance`,
  rune/elemental crit legs, `mana/life-gain-on-hit/-kill`, and Canary's
  own dead types 28-31 (kept inert upstream too).
- **Animus mastery earn path**: Canary grants it through Soul Pit
  encounters (soul cores drop 5 % from fiendish monsters,
  ondroploot_soul_core.lua); mantus ships state/bonus/projection with
  `AnimusService.grant` as the only server-side surface until an
  encounter system exists.

**Excluded by product decision (2026-07-25): livestream/casting.** Pinned
Canary ships it (`src/creatures/players/livestream/`), deliberately out of
scope here; the Feature 89 inventory classifies it
`excluded-product-decision`, never silently.

[Back to overview](README.md)
