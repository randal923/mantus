# Parity status — server and client, per system

At-a-glance view of what ships and what's missing, per system, split into
server and client columns. Derived from [`done.md`](done.md) (the permanent
record) and the area files ([`todo-1.md` … `todo-13.md`](README.md)) — when
they disagree, they win and this file needs an update.

**Maintenance:** when a feature ships (or a big slice lands), update the
affected row's status and "Still missing" cell in the same change that
updates `done.md`, and bump the date below. Feature numbers reference the
area files; the [client backlog](client/README.md) details every
client-only remainder.

Legend: ✅ shipped · ◐ partial · ❌ not started · — not applicable.

**Last updated:** 2026-08-07

## World & engine

| System (features)                                                                                   | Server | Client | Still missing                                                                                              |
| --------------------------------------------------------------------------------------------------- | ------ | ------ | ---------------------------------------------------------------------------------------------------------- |
| Map conversion, multi-floor movement, visibility (4)                                                | ✅     | ✅     | All 123 enabled sewer grates preserve their click target (32/32 in Thais); per-entry content review: 348 disabled map actions, 2,225 unresolved floor transitions |
| Rendering, animation, floors, occlusion (5–8)                                                       | —      | ✅     | Creature atlas failures self-heal (2026-08-03): sheet loads back off and retry, and a creature stays pending with a capped-backoff reload instead of vanishing for the session ("NPC not spawned after prod push"); walk cycle matches OTClient frame for frame since 2026-08-02, but diagonal steps still animate over the 3x duration and mounted cycles use the rider's phase count (both TODO.md); creature idle animation needs a modern outfit re-rip; fluid-subtype patterns unprojected; permanent effects play once |
| Creatures, spawns, AI, all 84,377 placements (9, 10)                                                | ✅     | ✅     | Spawn placement matches Canary's `placeCreature` since 2026-08-06 (walkability, not pathfinding, plus a home fallback): a creature that idled onto a blockpath tile is no longer deleted for the life of the process, and the 79 slots whose home is a blockpath tile now spawn. Four route-validated Hunt Finder grounds gained 11 types/83 placements; idle wandering still ignores Canary's height/pathfinding rule so NPCs can stand on counters (TODO.md); Carnisylvan Sapling's dynamic self-destruct trigger, typed-data buckets (3 NPC entries), placement review, Harlow duplicate |
| World actions: doors, levers, readables, rope, shovel, chests, plates, traps, teleports (12, 50–52) | ✅     | ✅     | Fields (50), trap disarm, tool remainder + sand digging (51), transform-on-use/`ignoreLook` flags (asset pass 108); look is server-authored since 2026-07-29 — carried/corpse items and a shift+click alias still missing (52); 2026-08-07 added eating food off the ground, blueberry-bush picking (703 bushes server-owned, 300 s regrow), the sickle, the fire bug (cane ignition, rare crumble/explode outcomes collapsed to fizzle), and woke wheat/cane/reed harvests (targets now server-owned); machete grass, pick digs, and fire-bug webs/basins stay dormant (targets not mutable); harvest yields don't merge into an existing tile stack, and the ground-food context menu still says "Use" not "Eat" |
| World events engine + 18 raids (54)                                                                 | ◐      | —      | Other global events, daily resets (boosted rotation shipped with 76), reward steps, `/raid` capability     |
| Exhausts, trash holders, pz-lock, crash harness (3, 12–15)                                          | ✅     | ✅     | Nothing — closed; 2026-08-07 closed the real-map gap: static water/lava/swamp/dustbin tiles now destroy thrown items (classification-3 side channel in items.bin) with each liquid's own effect (water blue rings) |

## Items & economy

| System (features)                                                                    | Server | Client | Still missing                                                                                                 |
| ------------------------------------------------------------------------------------ | ------ | ------ | ------------------------------------------------------------------------------------------------------------- |
| Item core: catalog, single-owner ops, containers, equipment, drag queue (11, 16, 17) | ✅     | ✅     | Item persists no longer race character saves and a dropped plan re-marks its memory-only world items (2026-08-02); ground-to-container drag cleanup fixed (2026-08-02); container stack/sort buttons shipped as server sweeps (2026-08-05); fluids (11), browse-field, 7-tile throw range (16), item parity gate (17) |
| NPC shops — 8,368 offers (46)                                                        | ✅     | ✅     | Memory-first buy/sell + amount slider (2026-07-30); shopping-bag fill, finite stock (product decision)         |
| Bank (45)                                                                            | ✅     | ✅     | Memory-first deposit/withdraw (2026-07-30); balance in the top-bar wallet counter (2026-08-01); `change gold`/`change platinum` conversions; six gold sinks still charge the bank without reporting the new balance (`TODO.md`) |
| Depot, inbox, mail, supply stash (11c)                                               | ✅     | ✅     | Carried pane lists nested-backpack contents (2026-08-01); mailbox still mails top-level items only (`TODO.md`) |
| Player trade (48)                                                                    | ✅     | ✅     | Ground-item offers; store/unique/house-tile restrictions (wait on 43/78/houses)                               |
| Market with escrow (49)                                                              | ✅     | ✅     | Unique rarity-item listings with per-offer tooltips shipped 2026-08-05 (graded sales stay out of the price average); full-catalog browser (asset pass 108), expiry decision; selection retention (client) |
| Item rarity & affixes (2026-08-05)                                                   | ✅     | ✅     | Grades on equipable drops (config chances), 12-affix pool wired into combat/progression, tinted tooltip, market listings, NPC bulk-sell guard; affix leech is auto-attack-only, ground tiles show no rarity, loot announce/bestiary palette polish (TODO.md) |
| Mantus Store: full Canary catalog (43)                                               | ✅     | ✅     | 631 products/670 offers incl. house furniture/decorations/upgrades as decoration kits (exercise dummies purchasable, unwrap on owned house tiles) shipped 2026-07-29; full-height catalog + purchase dialog shipped 2026-08-02 (integration tests unrun — no DB); store-exclusive epic/legendary exercise weapons (5x training, own icon aura) replaced the stock exercise shelf + store blurb on the home page 2026-08-02; payment provider, coin transfers, history tab (client), kit wrap-back still open |

## Progression & combat

| System (features)                                                                          | Server | Client | Still missing                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vocations, stats, progression, promotion, Monk (18–20)                                     | ✅     | ✅     | No level cap — experience is bigint end to end and the DB carries no upper bounds, matching Canary (2026-08-03); Character Details shows equipment bonuses with a base+equipment hover, and item `speed` finally reaches walk speed; attack-speed affixes reach the swing timer since 2026-08-05; equipment still cannot move regeneration or the XP rate (TODO.md) |
| Combat core, conditions, potions, all 171 monster spells, action bars, spell words (22–28) | ✅     | ✅     | 56 disabled player spells: Monk harmony unit + 2 conditions + 17 field/wall runes + mass heals (24), house words (109), exiva (65), familiars' 5 (85); revelation actives incl. Divine Empowerment shipped 2026-08-03; action bot rules on area spells gate on a live monster count (≥/≤/=) 2026-08-06 |
| Monster death, loot rolls, corpses, quick-loot sweep, auto-loot filter (29–31)             | ✅     | ✅     | Child loot containers, `unique` flag, loot subType, reward-boss rules, 175 death callbacks; auto-loot ✅ (2026-07-30) is a per-rarity pick-up list with item tooltips and a creature-drop browser (2026-08-06); needs one-tile reach and has no per-category container routing; the Loot Pouch (ex Item Pouch/Gold Pouch; since 2026-08-08 character-bound in the `bound` slot container, granted at creation + backfilled, no longer sold) claims all destination-less loot; the store's Portable Seller vendors its contents every 10 min or on use |
| Player death penalty — full Canary formula (32)                                            | ◐      | ✅     | Blessings purchasable (Henricus + VIP full bless) and consumed on death; item/container drop into player corpse still missing (needs player corpses, 72)                                            |
| Decay: carried + world (33, 34)                                                            | ✅     | —      | Row-less world items are dropped instead of retried forever, and a 2-hour map clean sweeps loose ground items with a broadcast countdown (2026-08-02); spell fields as real world items, charge expiry |
| Stamina, soul, training engines (18) → in-world triggers (72)                              | ◐      | ◐      | Beds/sleep, offline-training statue trigger, food/soul regen persistence (blessings persistence+purchase shipped 2026-08-08); exercise weapons/dummies ship, incl. the 5x epic/legendary store tiers with latency-proof bundled charge spends 2026-08-02 (retuned from 2x to 5x 2026-08-04) (house-membership check still missing); VIP +10% exercise pace 2026-08-08                     |
| PVP: skulls, frags, pvp-zones, combat logout (59, 60)                                      | ✅     | ✅     | E2E logout playtest; linger-window inventory (lands with 32)                                                                                                                                       |

## Social

| System (features)                                                       | Server | Client | Still missing                                                                                 |
| ----------------------------------------------------------------------- | ------ | ------ | --------------------------------------------------------------------------------------------- |
| Parties, shared exp, analyzer, finder (55–57)                           | ✅     | ✅     | Party-spell target gating (co-lands with 24)                                                  |
| Guilds, wars, emblems, guild bank (58, 63)                              | ✅     | ◐      | Per-rank withdraw permission; fix 3 ledger-constraint integration tests (first run 2026-07-26); bank UI section |
| Houses: buy, rent, transfer, auctions, access lists, guildhalls (61–64) | ✅     | ◐      | House spell words (109); door-list editor UI (62); absence eviction 7d free / 10d VIP with day-5 letter 2026-08-08 |
| VIP/friends, groups, requests, typing (65)                              | ✅     | ◐      | Finder privacy setting, exiva spells; VIP-group UI                                            |
| Chat, channels, talkactions, flood control (35, 36)                     | ✅     | ✅     | Admin talkactions, GM/broadcast modes, durable ignore lists                                   |
| Moderation + role-authorized admin core (66, 96)                        | ✅     | —      | Role-assignment tooling, `/coins`+`/raid` capabilities, `/conservation` view                  |
| NPC dialogue engine, travel, 6 typed command families (37–42)           | ◐      | ✅     | The 611-entry procedural grind (38), new condition/effect kinds (40), gated/quest routes (41), spell purchases have no gameplay effect + ~130 offers missing their confirmation branch (TODO.md) |

## Modern systems

| System (features)                                        | Server | Client | Still missing                                                               |
| -------------------------------------------------------- | ------ | ------ | --------------------------------------------------------------------------- |
| Minimap (68)                                             | ✅     | ◐      | Marker editing + walk feedback                                              |
| UI settings sync (69)                                    | ✅     | ◐      | Movable chat/battle-list/spell-bar panels                                   |
| Bestiary + bosstiary + charm earning (73, 77)            | ✅     | ✅     | Charm **spending**, shared-exp kill credit                                  |
| Wheel of Destiny + Gem Atelier (79–81)                   | ◐      | ✅     | Periodic conviction majors, Monk perks (need harmony), Drain Body leech, gem long tail, extra point sources, 5 gem deviations, revelation-active deviations in TODO.md (Divine Empowerment zone, harmony echo); revelation actives (5 avatars + 5 procedural spells) + relog-safe cooldown persistence shipped 2026-08-03, Tibia-layout Atelier + Workshop shipped 2026-08-02; VIP −30% Gift of Life/avatar cooldowns 2026-08-08 |
| Outfits + mounts (70, 71)                                | ✅     | ✅     | Full Canary catalog (252 outfits/236 mounts) + per-sex wardrobe + addon rendering shipped 2026-07-28; premium gate unenforced (TODO.md), unlock sources ride with store/achievements/quests (43, 67) |
| Profiles: achievements, titles, badges, char info (67)   | ✅     | ✅     | Nothing — closed; rename flow (2) and Cyclopedia display (83) live elsewhere |
| Prey (74)                                                | ✅     | ✅     | Third slot + wildcard packs now sold by the store (43, 2026-07-29); party-shared loot boost → 77 |
| Hunting tasks (75)                                       | ✅     | ✅     | Point spending surface + wheel point-source read (80); third-slot store offer (43) |
| Hunt Finder and route guide (111)                        | —      | ✅     | All 132 guides ship and static monsters have server spawn coverage; `yarn hunts:build --world` sweeps the whole map: 320 hunts (132 hand-written + 188 generated) over 28 regions, caves gathered per hunt and picked from a map of entrances (2026-08-06) — remaining regions and measured xp/loot for generated entries in TODO.md; dynamic Carnisylvan Sapling trigger remains; six RubinOT-only item labels use text fallbacks |
| Hunting bot: waypoints + auto-target (112)               | ✅     | ✅     | Ladders/holes/ropes and closed doors are not crossed, so ~5 % of guide legs arrive flagged for hand editing (TODO.md); shared taller HUD feature controls shipped 2026-08-02; route map isolates the hunt (geometric mask, toggle) 2026-08-06 |
| Boosted creatures/bosses + reward-boss flag (76)         | ✅     | ✅     | Nothing — slot/boosted loot bonuses now feed reward-chest rolls (84)        |
| Imbuements, tiers, Exaltation Forge (78)                 | ✅     | ✅     | Full shrine workspace refreshed 2026-08-01; stash-drawn sources, equipment badges; docked imbuement tracker with live timers 2026-08-02 (no duration filters, TODO.md); item picker narrowed to worn containers + "Equipped" badge and the blank-scroll tile removed 2026-08-03 (scroll forging has no client entry point, TODO.md); shrines made server-owned (map re-import — needs db:reconcile-world-seed); astral sources open server-authored item cards on hover 2026-08-06; migration 067 pending; VIP PZ decay protection + decay-sweep baseline fix (decay never ran) 2026-08-08 |
| Weapon proficiency + animus mastery (82)                 | ✅     | ✅     | Spell-facing perk families ride 79, inert families + Soul Pit earn path ride 86; locked-row thresholds/animus race list → 87; VIP +10% proficiency exp 2026-08-08 |
| Cyclopedia views (83)                                    | ✅     | ✅     | Map view (stub upstream, skipped); combat-view live refresh while open → 87 |
| Reward chests, quick-loot assignment, daily rewards (84) | ◐      | ◐      | Chests + daily rewards ✅ (2026-07-26); reward wall + bonuses/history ✅ (2026-07-30); calendar redesign + exercise chooser ✅ (2026-08-01); claimable-day call to action, countdown on the waiting day, midnight refresh ✅ (2026-08-03); exercise chooser fixed — unclickable disabled-option dropdown replaced by animated weapon art ✅ (2026-08-06); loot-container assignment + stash routing + out-of-window claimable icon remain |
| Familiars, hirelings (85)                                | ❌     | ❌     | Everything (summon runtime exists; importer lanes + runtime gaps mapped in todo-10) |
| Long tail: hazard, concoctions, difficulty, podium (86)  | ◐      | ◐      | Hazard + concoctions + inert perks/animus earn; podium + stat residuals ✅, difficulty = upstream no-op; livestream **excluded** (product decision) |
| Quests (103–105)                                         | ◐      | ◐      | Platform + rewards/log + catalog+parity gate ✅ (2026-07-26); 114 script-dir behaviors + dynamic descriptions + tracker remain |

## Engineering & launch

| System (features)                                               | Server | Client | Still missing                                                                                            |
| --------------------------------------------------------------- | ------ | ------ | -------------------------------------------------------------------------------------------------------- |
| Reconnect/resync, state bounds, error taxonomy (90–92)          | ❌     | ❌     | All (freeze probes ship as regression gates)                                                             |
| Client polish: lighting, sound, hotkey persistence, modals (87) | —      | ❌     | All                                                                                                      |
| Performance budgets + deferred items (88, 106, 107)             | ◐      | ◐      | Measure-first list; login is 1 connection but ~28 sequential round trips (collapse to one statement); intents (2026-08-02) and resolved DB outcomes (2026-08-03, `ResolvedOutcomes` + `TickLoop.wakeAll`) both wake the tick; per-swing try-award saves coalesced onto the 30 s interval 2026-08-03 (level-ups/XP/death still save in place) |
| Network/resource limits (93)                                    | ◐      | —      | TLS/origin policy, per-intent rates, per-IP caps, idle timeouts                                          |
| Structured logging + metrics/alerting (94, 95)                  | ❌     | —      | All                                                                                                      |
| Error handling, durability/drain, DB audit/recovery (97–99)     | ❌     | —      | All                                                                                                      |
| Testing + release gates, CI (100)                               | ◐      | ◐      | Staging soak, fuzz, full CI pipeline, launch runbook                                                     |
| Auth follow-ups (101)                                           | ◐      | ◐      | Captcha, production rate limits, reauth forms, coin funding; public Login/Play Now session actions shipped 2026-07-31 |
| Dev tooling (102)                                               | ◐      | ◐      | AI-detach fix, delete audit event, gm-response rendering                                                 |
| Public website + read-only public API (110)                     | ✅     | ✅     | Editorial preview/archive content (content-first route frame, Tibia-style news, vocation guide, and profile polish shipped 2026-07-31) is provisional; sibling-character lists need a public opt-in; wiki dropdown + /wiki/items rarity & affix guide shipped 2026-08-05 (client copy of rarity tuning — see TODO.md); guild directory + public rosters (/guilds) shipped 2026-08-05; /vip-account benefits page (renders PREMIUM_BENEFITS, 4 coming-soon rows → todo/vip-*.md) 2026-08-08 |
| Parity ledger + gates (1, 17, 26, 89)                           | ◐      | —      | Importer surface extensions; inventory generator (89, unblocked by the pinned checkout since 2026-07-26) |

## The shape of what's left

The shipped core is deep — world, items, economy, combat, social, houses,
all exploit-tested. The gaps cluster in four places:

1. **Not-started modern systems**: familiars/hirelings (85) and the
   hazard/concoction units of 86; reward chests + daily rewards (84) and
   the quest platform/log/catalog (103–105) closed 2026-07-26 alongside
   boosted, the forge, proficiency/animus, and the Cyclopedia (76, 78,
   82, 83).
2. **The NPC content grind**: 611 procedural entries (38/40/41).
3. **Client surfaces**: only small panels remain (the profile, prey, and
   hunting-task windows shipped 2026-07-26); the
   [client backlog](client/README.md) lists the rest.
4. **Launch hardening**: logging, metrics, error handling, durability,
   release gates (93–100).

[Back to overview](README.md)
