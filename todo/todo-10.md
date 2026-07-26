# Todo 10 — Remaining Canary systems

**Features 68†–71†, 72–86.** Later in order but **not optional in final
scope**. Shipped cores: minimap with markers/click-to-walk, account UI
settings with reset/sync, bestiary/bosstiary, Wheel core, Gem Atelier, the
Mantus Store slice, outfit/mount entitlements with server-side validation
and mount speed, and the blessing data layer (see [done.md](done.md)).
**Feature 72 is the highest-leverage unblocker in the whole backlog.**

## Client-only remainders (server + protocol ship)

- [ ] **Feature 68 — Minimap marker editing + walk feedback** → [client](client/feature-68-marker-editing.md)
- [ ] **Feature 69 — Movable chat/battle-list/spell-bar panels** → [client](client/feature-69-movable-panels.md)
- [ ] **Feature 70 — Outfit window** → [client](client/feature-70-outfit-picker.md); unlock sources ride with Features 43 (store), 67 (achievements), and quests — each calls `OutfitService.grantOutfit`
- [ ] **Feature 71 — Mounted rendering + mount row** → [client](client/feature-71-mount-rendering.md); mount unlock sources alongside Feature 70's

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

## Feature 74 — Prey system

Per-slot creature bonuses modifying combat/loot/exp, with paid rerolls.
Unblocks Feature 9's prey bucket (todo-3).

**Remaining:** new `server/src/prey/` module with durable slot state
(migration + store); reroll debits via bank transactions with ledger + audit;
durable wildcard balances; bonuses applied server-side at kill-reward and
damage execution (re-checked at execution, not cached from selection);
bounded select/reroll/lock intents with rate limits.
**Tests:** reroll races cannot double-debit or double-roll; bonuses apply
only to the slot's race at kill execution; reroll RNG server-side.

## Feature 75 — Hunting tasks

Kill goals with rewards and points — a Wheel point source (Feature 80).

**Remaining:** kill tracking off the same death hooks as bestiary
(`BestiaryHooks.ts` pattern); durable task state; reward grants in single
audited transactions; bounded select/reroll/claim intents with execution-time
re-checks (goal met, not already claimed).
**Tests:** claim races cannot double-grant; kill credit follows the server
death path only.

## Feature 76 — Boosted creatures/bosses, kill trackers, reward-boss flag

**Remaining**

- Daily boosted creature/boss selection with exp/loot modifiers —
  server-selected with server RNG, scheduled through Feature 54's engine
  (todo-2), applied in kill-reward and loot-roll paths at execution time.
- Client kill trackers and boss slots — projections bounded to the
  requesting character's own counts.
- **Import `isRewardBoss` onto `MonsterType`** (with Feature 84 this owns
  the typed reward-boss representation) — closes Feature 9's blocked bucket
  (911 monsters).
- **Reward-boss combat guards** (absorbed from Feature 23): gate
  `challengeMonster` / `pullMonsterToMelee` once the flag exists (only the
  summon guard is enforced today).

**Tests:** modifiers apply only to the selected race/boss on the current
day; trackers expose only own counts; reward bosses cannot be challenged or
melee-pulled.

## Feature 77 — Bestiary accepted-limitation fixes

**Remaining:** kill credit should also cover no-damage party members under
active shared exp (compute the credit set in `BestiaryHooks.ts` from
`getPartyExperienceShares.ts` — execution-time membership); route
`bestiary-action-failed` to both modals client-side; queue a second sheet
request inside the 300 ms cooldown instead of erroring.
**Tests:** no-damage eligible member credited, ineligible not; client queues
within the cooldown window.

## Feature 78 — Imbuements, item tiers, and Exaltation Forge

The forge complex — heavy economy exposure; every conversion atomic and
audited. Unblocks Feature 81's drop classification and slices of Features
48/49 (todo-8).

**Remaining:** imbuements; classification/tiering; Exaltation Forge +
history; dust/slivers/cores; influenced/fiendish monsters; atomic
conversions throughout; retire the gem-drop deviation (bestiary stars →
forge states) once monster states exist.

**Implementation:** item attribute extensions (tier, imbuement
slots/charges) on single-owner rows with single-step mutations; each
conversion (fusion, transfer, exchanges) one ACID transaction with audit
rows and in-transaction server-RNG rolls; forge history written in the same
transactions; influenced/fiendish assigned server-side at spawn; bounded zod
intents first; costs/prerequisites re-checked at execution.

**Tests:** conversion races conserve resources; failed fusions consume
exactly what Canary consumes; tier rolls server-side; history rows match
audit rows one-to-one.

## Feature 79 — Wheel combat wiring (incl. revelation perks)

The Wheel core computes bonuses; large parts are combat-inert — the biggest
wheel-parity gap.

**Remaining:** apply mitigation multiplier, life/mana leech, magic skill
boost, revelation flat damage/healing; conviction instants (Battle Instinct
…); spell grants/augments from allocation; revelation abilities (Gift of
Life, Avatars, Beam Mastery, …); gem overlap (supreme spell augments, dodge,
crit damage, gem leech/mitigation) currently display-only.

**Implementation:** thread `WheelBonuses`/`computeGemBonuses` into
`Combat.ts`, `DamageResolver`, `SpellCaster.ts`/`SpellRegistry.ts`, and the
healing paths; revelation abilities as server-side effects with server RNG;
bonuses read from the server-owned allocation at execution each tick/cast.
Also: the WOD-graded combat areas deviation in `TODO.md` (per-grade area
lists picked from `player.wheelBonuses` at cast time) lands here/Feature 80.

**Tests:** client claiming unallocated bonuses changes nothing; spell grants
appear/disappear with allocation at execution; gem mods verified active in
damage resolution.

## Feature 80 — Wheel rule gaps

**Remaining:** restrict allocation decreases to a temple-adjacent PZ
(enforce in `WheelService.handleSave` when any slice shrinks); extra point
sources (promotion scrolls — needs store/quest items; Monk quest bonus;
hunting-task points from Feature 75); include the wheel capacity bonus in
`PgItemLocks` offline capacity; project boosted (green) skill values in the
skills panel (projection only).
**Tests:** shrinking saves outside a temple PZ rejected; point-source grants
exactly-once (scroll consumption atomic with grant).

## Feature 81 — Gem atelier Canary deviations

Five recorded deviations to retire, all in
`server/src/wheel/GemAtelierService.ts`, `rollRevealedGem.ts`,
`GemDropHooks.ts`:

- Carried-gold payment leg atomic with the bank leg (one transaction, ledger
  + audit intact).
- Temple-tile check on reveal at execution time.
- `normal_random` destroy yields (server RNG) instead of uniform.
- Drop classification switch to forge monster states once Feature 78 lands.
- Item-ification of gems/fragments only if 8.6-era sprites become available;
  otherwise keep balances and the recorded deviation.

**Tests:** mixed bank+carried payment conserves gold under races; reveal
outside a temple rejected; destroy distribution matches `normal_random`.

## Feature 82 — Weapon proficiency and animus mastery

**Remaining:** proficiency and animus tracking in progression (durable
per-character state, server-side accrual from combat events); combat
application in `server/src/combat/` at execution time; bounded perk
selection intents. Canary reference for perk tables and accrual rates.
**Tests:** accrual only from server combat events; selections validated
against earned progress at execution.

## Feature 83 — Cyclopedia views

The danger is over-sharing: every view is an authorized bounded projection,
never a raw game-state query.

**Remaining:** character/map/house/item/monster views;
achievements/titles/badges display (Feature 67's tables); attached effects;
authorized tracker projections.

**Implementation:** bounded read models per view following the
`HighscoreService` pattern (fixed parameterized queries, row limits, no
private state); client modals in `client/components/` (reuse Feature 67's
list components); house view ties to auction data; monster view builds on
stage-gated bestiary projections.

**Tests:** each view exposes only authorized data; queries bounded
regardless of client parameters.

## Feature 84 — Rewards and loot QoL

**Remaining:** reward bosses + reward chests (per-player instanced container
on the item-ownership model, following the depot pattern); quick loot +
loot-container assignment (server-validated intents respecting the
memory-first corpse invariant — first touch drives persistence); quick-loot
routing into the supply stash; daily rewards with durable server-clock
streak timers; all grants in single audited transactions.

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

**Excluded by product decision (2026-07-25): livestream/casting.** Pinned
Canary ships it (`src/creatures/players/livestream/`), deliberately out of
scope here; the Feature 89 inventory classifies it
`excluded-product-decision`, never silently.

[Back to overview](README.md)
