# Canary deferred world-action triage

Source of truth: `content/canary-world-action-parity.json` (261 registrations with `status: "deferred"`), triaged by opening every referenced Lua file in `/home/randal/code/canary` at commit `a879c931`.

## Bucket counts

| Bucket | Meaning | Count |
| --- | --- | ---: |
| **A** | quest-touch data only — Fits the new position-keyed table: use at position -> remove/transform/create map items, message, effect, optional cooldown/timed restore. No storage gating. | 12 |
| **B** | chest-like — Grants items once per character; expressible as a chest definition in `server/data/chests.json` / `quest-chests.json`. | 4 |
| **C** | storage state machine — Needs per-character quest storage reads/writes beyond a looted flag (quest doors, mission steps, gated levers/teleports). | 30 |
| **D** | movement-triggered — Step-in / step-out (or add-item) tiles; extends `PressurePlateRegistry` or a sibling movement registry. | 45 |
| **E** | new mechanic required — Named subsystem is missing (teleport-on-use, boss arenas, blessings, imbuements, house furniture, conditions/buffs, store, timers spanning restarts, ...). | 158 |
| **F** | cosmetic/skippable — No gameplay effect; a flavour message and/or effect only. | 12 |
| | **Total** | **261** |

### Reading the counts

- **E dominates (158/261, 61%)** because the deferred set is *not* mostly quest scripts. It is mostly generic engine surface: food/condition buffs, blessings, imbuements, forge, store, house furniture, familiars, offline training, monster AI events. Each needs a named subsystem, not a data row.
- The single largest *coherent* sub-group inside E is **teleport-on-use** (~25 registrations: hive gates, sewer grates, elevators, rope-downs, ore wagons, vines, feyrist/soulpit exits, oskayaat, draw wells, `teleport_item.lua`). All of them are "use item/position -> move player to a fixed destination + effect". **One new verb on the quest-touch table (`teleport`) collapses ~25 E entries into data.** Bucket D adds ~30 more of exactly the same shape on step-in.
- Only **12** deferred registrations are pure quest-touch (A) and **4** are chest-like (B) — the chest importer and the existing lever/pressure-plate work already absorbed most of that class.

## A — quest-touch data only (12)

These are the ones the new table can express verbatim:

- `data/scripts/actions/items/blueberry_bush.lua` (action) — Uses a blueberry bush: transforms 3699->3700, starts decay back, drops 3 blueberries on the tile - fits quest-touch (transform + create + timed restore), keyed by item id not position. _[ids 3699]_
- `data/scripts/actions/tools/sickle.lua` (action) — Cutting sugar cane (5463) transforms it to the stub 5462 with decay-back and creates a bunch of sugar cane on the tile - exactly quest-touch shaped (transform + create + timed restore). _[ids 3293]_
- `data-otservbr-global/scripts/actions/kazordoon/stone.lua` (action) — Lever removes/creates the four stone blocks (1787-1790) at fixed positions and toggles itself - pure quest-touch data. _[aids 50237; stamped in the OTBM map, not by a startup table]_
- `data-otservbr-global/scripts/actions/kazordoon/trap_door.lua` (action) — Lever opens/closes a trapdoor ground (369<->416) and drops loose items to the floor below - quest-touch plus an item-drop nuance. _[aids 50238; stamped in the OTBM map, not by a startup table]_
- `data-otservbr-global/scripts/actions/object/dancingfairy.lua` (action) — Touching the fairy prints "Doooon't touch me! *puff*", transforms 25747->25748 and restores it after 60s with an achievement - textbook quest-touch with timed restore. _[dynamic selectors (table-driven)]_
- `data-otservbr-global/scripts/actions/other/trap.lua` (action) — Using a sprung trap (3482) re-arms it (transform to 3481) with a puff - one-line quest-touch entry. _[ids 3482]_
- `data-otservbr-global/scripts/actions/rookgaard/bear_room_quest/bear_room_quest_lever.lua` (action) — Lever removes the blocking stone at (32145,32101,11) or pushes creatures aside and recreates it - quest-touch (remove/create + lever toggle). _[uids 1056; stamped in the OTBM map, not by a startup table]_
- `data-otservbr-global/scripts/actions/rookgaard/bear_room_quest/bear_room_quest_stone.lua` (action) — Same bear-room stone toggle bound to action id 30006 instead of the unique id. _[aids 30006; stamped by lever.lua:Action, lever.lua:Unique]_
- `data-otservbr-global/scripts/actions/rookgaard/katana_quest/katana_quest_door.lua` (action) — Re-opens the katana room door (5108->5107) and resets the lever, re-stamping the unique id on the door. _[uids 22006; stamped in the OTBM map, not by a startup table]_
- `data-otservbr-global/scripts/actions/rookgaard/katana_quest/katana_quest_lever.lua` (action) — Lever closes/opens the katana room door, relocating anything standing in the doorway - quest-touch plus unique-id restamping. _[uids 30029; stamped by lever.lua:Unique]_
- `data-otservbr-global/scripts/actions/rookgaard/sewer_lever.lua` (action) — Rookgaard sewer bridge lever: transforms the ground tiles, creates/removes the bridge items and relocates creatures/items off the span. _[aids 50239; stamped in the OTBM map, not by a startup table]_
- `data-otservbr-global/scripts/movements/teleport/dark_cathedral_teleports.lua` (action) — Dark Cathedral lever: transforms 2772->2773 and reverts itself after 10 minutes ("It doesn't move." when already pulled) - quest-touch with a long timed restore. _[aids 30004; stamped by lever.lua:Action, lever.lua:Unique]_

## B — chest-like (4)

- `data-otservbr-global/scripts/actions/rookgaard/chest.lua` — Grants a wooden sword once per character, gated on raw storage 405492, with "The chest is empty." afterwards - a plain chest definition. _[aids 30492; stamped in the OTBM map, not by a startup table]_
- `data-otservbr-global/scripts/actions/rookgaard/goblin_temple_quest.lua` — Gives a bag with sandals + 5 small stones + 50 gold once per character (questKV "goblintemple"). _[uids 14049; stamped in the OTBM map, not by a startup table]_
- `data-otservbr-global/scripts/actions/rookgaard/goblin_temple_quest.lua` — Gives a bag with a pan + 4 snowballs + vial of milk once per character (questKV "goblintemple2"). _[uids 14050; stamped in the OTBM map, not by a startup table]_
- `data-otservbr-global/scripts/actions/rookgaard/rapier_quest.lua` — Gives a rapier once per character via canGetReward/questKV "rapier" and takes a treasure screenshot. _[uids 14042; stamped in the OTBM map, not by a startup table]_

## C — storage state machine (30)

Storage keys these need, and whether `content/quests/canary-quests.json` (51 quests, 481 distinct storage keys) already references them:

| Storage key | In our 51-quest catalog? | Used by |
| --- | --- | --- |
| `Quest.U10_55.Dawnport.Questline`, `.GoMain` | yes | dawnport tutorial tiles |
| `Quest.U10_55.Dawnport.VocationReward` | **no** | dawnport chest-room tile |
| `Dawnport.Lever`, `Dawnport.DoorVocation`, `Dawnport.Tutorial` | **no** (not under `Quest.`) | dawnport lever / vocation door / temple stairs / tutorial tiles |
| `Quest.U8_0.BarbarianTest.Questline` | yes | citizen + citizen_svargrond |
| `Quest.U7_8.TheShatteredIsles.TheGovernorDaughter`, `.AccessToLagunaIsland` | yes | rake, turtles |
| `Quest.U8_2.TheThievesGuildQuest.Mission02` | yes | lock_pick |
| `Quest.U8_6.AnInterestInBotany.Questline` | yes | skinning |
| `Quest.U8_1.TibiaTales.AritosTask` | yes | destroy (scimitar/cave entrance) |
| `Quest.U8_7.JackFutureQuest.QuestLine` | yes | construction_kits |
| `Quest.U10_70.LionsRock.Questline` | yes | gems |
| `Quest.U10_70.LionsRock.LionsRockFields` | **no** | gems (field counter) |
| `Quest.U11_02.ForgottenKnowledge.Tomes` | yes | imbuement_shrine gate |
| `Quest.U8_2.ElementalSpheres.QuestLine`, `.MachineGemCount` | **no** | enchanting |
| `Quest.U12_20.KilmareshQuest.Sixth.*` | **no** | gems (ivory mask) |
| `Quest.U10_80.GrimvaleQuest.WereHelmetEnchant` | **no** | moonlight_crystals |
| `Quest.U8_7.RottinWoodAndTheMarriedMen.RottinStart` | **no** | hammer |
| `Quest.U9_80.AdventurersGuild.Stone`, `.MagicDoor` | **no** | adventurers stone / magic door / guild exit |
| `Storage.WagonTicket` | **no** | kazordoon ore wagons |
| `Storage.ShrineEntrance` | **no** | shrine entrance/exit |
| `Storage.BanutaSecretTunnel.DeeperBanutaShortcut` | **no** | deeper banuta shortcut |
| `Quest.U12_90.PrimalOrdeal.Bosses.MagmaBubbleKilled` | **no** | gnomprona teleport gate |
| `Storage.Diapason.*`, `ThreatenedDreams.Mission03.*` | **no** (Diapason) / partial | music (lyre, panpipes) |
| raw `405492`, `789100` | n/a (raw numeric) | rookgaard chest, skinning |
| `QuestDoorTable` action ids (165 keys / 269 positions) | n/a — the *door* actionId **is** the storage key | quest_door.lua |

Roughly **half** of the storage keys the deferred C-bucket needs are already in the imported 51-quest catalog; the misses cluster in Dawnport, Adventurers Guild, and utility storages (`WagonTicket`, `ShrineEntrance`) that live outside `Storage.Quest.*` in Canary and were therefore not part of the quest import.

## Full triage (one line per deferred registration)

`sourcePath` | bucket | behaviour | ids/positions (and which startup table stamps them)

| sourcePath (idx / name) | B | Behaviour | Selectors |
| --- | :-: | --- | --- |
| `data-otservbr-global/scripts/actions/adventurers_guild/adventurers_stone.lua`<br/>_action_ · idx 0 | C | Only usable inside a listed town hall: records the town id in AdventurersGuild.Stone storage and teleports the player to the guild. | ids 16277 |
| `data-otservbr-global/scripts/actions/adventurers_guild/magic_door.lua`<br/>_action_ · idx 0 | C | Magic door teleports in/out of the guild, flipping AdventurersGuild.MagicDoor storage to pick the return side. | ids 17318, 17319 |
| `data-otservbr-global/scripts/actions/arena_pvp/arena_10x10.lua`<br/>_action_ · idx 0 | E | Lever requires 10 players standing on the entry tiles and teleports both teams into the arena; missing mechanic: multi-player ritual + arena occupancy. | ids 24181 |
| `data-otservbr-global/scripts/actions/arena_pvp/arena_2x2.lua`<br/>_action_ · idx 0 | E | Same as the 10x10 arena but for 2 players; missing mechanic: multi-player ritual. | ids 24173 |
| `data-otservbr-global/scripts/actions/dawnport/lever.lua`<br/>_action_ · idx 0 | C | Dawnport drawbridge lever: Storage.Dawnport.Lever 1<->2 state machine, transforms the bridge tiles, teleports creatures off it, and re-arms the lever after 8 seconds. | aids 30001; stamped by lever.lua:Action, lever.lua:Unique |
| `data-otservbr-global/scripts/actions/dawnport/vocation_door.lua`<br/>_action_ · idx 0 | C | Teleports the player into the vocation chest room only when Storage.Dawnport.DoorVocation matches the door vocation, else "sealed against unwanted intruders". | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/falcons/falcon_shield.lua`<br/>_action_ · idx 0 | E | At a fixed mould position, consumes falcon crest + shield parts to produce the falcon shield; missing mechanic: item consumption on use-with at a position. | ids 28721 |
| `data-otservbr-global/scripts/actions/farmine/temple_of_equilibrium_vines.lua`<br/>_action_ · idx 0 | E | Climbing the vines teleports the player down with a message and puff (aid 12141 goes down, 12142 refuses); missing mechanic: teleport-on-use. | aids 12141, 12142; stamped by item.lua:Action |
| `data-otservbr-global/scripts/actions/kazordoon/elevator_lever.lua`<br/>_action_ · idx 0 | E | Lever toggles 2772/2773 and teleports the player standing west of it to another floor; missing mechanic: teleport-on-use tied to a lever. | aids 50011, 50012; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/actions/kazordoon/ore_wagons.lua`<br/>_action_ · idx 0 | C | Ore wagon network: teleports between ~40 stops, but stops below aid 50245 require Storage.WagonTicket to be a future timestamp (weekly ticket). | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/kazordoon/stone.lua`<br/>_action_ · idx 0 | A | Lever removes/creates the four stone blocks (1787-1790) at fixed positions and toggles itself - pure quest-touch data. | aids 50237; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/actions/kazordoon/trap_door.lua`<br/>_action_ · idx 0 | A | Lever opens/closes a trapdoor ground (369<->416) and drops loose items to the floor below - quest-touch plus an item-drop nuance. | aids 50238; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/actions/object/dancingfairy.lua`<br/>_action_ · idx 0 | A | Touching the fairy prints "Doooon't touch me! *puff*", transforms 25747->25748 and restores it after 60s with an achievement - textbook quest-touch with timed restore. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/object/deathlings_entrance.lua`<br/>_movement_ · idx 0 | D | Step-in on two fixed tiles teleports the player past the deathling barrier with a teleport effect. | 1 map position(s) |
| `data-otservbr-global/scripts/actions/object/etcher.lua`<br/>_action_ · idx 0 | E | Clears all imbuements from the target item and is consumed; missing mechanic: imbuements. | ids 51443 |
| `data-otservbr-global/scripts/actions/object/imbuement_scrolls.lua`<br/>_action_ · idx 0 | E | Applies an imbuement scroll to an imbuable item; missing mechanic: imbuements. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/object/imbuement_shrine.lua`<br/>_action_ · idx 0 | E | Opens the imbuement window, optionally gated on ForgottenKnowledge.Tomes storage (key is in our quest catalog); missing mechanic: imbuements. | ids 24964, 25060, 25061, 25174, 25175, 25182, 25183 |
| `data-otservbr-global/scripts/actions/object/moonlight_crystals.lua`<br/>_action_ · idx 0 | C | Uses a moonlight crystal on a were-item; which enchanted item you get is selected by GrimvaleQuest.WereHelmetEnchant storage (0-5), and the crystal is consumed. | ids 22083 |
| `data-otservbr-global/scripts/actions/object/rope_down.lua`<br/>_action_ · idx 0 | E | Using the rope spot at (33014,32983,7) teleports down into Oskayaat; missing mechanic: teleport-on-use at a position. | 1 map position(s) |
| `data-otservbr-global/scripts/actions/object/rope_down.lua`<br/>_action_ · idx 0 | E | Using the rope spot at (33395,32651,1) teleports down into Cobra Bastion; missing mechanic: teleport-on-use at a position. | 1 map position(s) |
| `data-otservbr-global/scripts/actions/object/wz789_entrance.lua`<br/>_movement_ · idx 0 | D | Step-in on four fixed tiles teleports the player through, but pushes back anyone below level 250. | 1 map position(s) |
| `data-otservbr-global/scripts/actions/oramond/elevator.lua`<br/>_action_ · idx 0 | E | Rathleton elevator moves the player between two fixed floors; missing mechanic: teleport-on-use. | ids 21051, 21058 |
| `data-otservbr-global/scripts/actions/oramond/sewer_grate.lua`<br/>_action_ · idx 0 | E | Sewer grate moves the player two floors down/one east; missing mechanic: relative floor change on use. | ids 21298 |
| `data-otservbr-global/scripts/actions/oramond/sewer_grate_teleport.lua`<br/>_action_ · idx 0 | E | Sewer grate moves the player two floors up/one east; missing mechanic: relative floor change on use. | ids 21297 |
| `data-otservbr-global/scripts/actions/oramond/teleport_north.lua`<br/>_action_ · idx 0 | E | Moves the player one floor up from the used position; missing mechanic: relative floor change on use. | ids 20578 |
| `data-otservbr-global/scripts/actions/oramond/teleport_west.lua`<br/>_action_ · idx 0 | E | Moves the player one floor up from the used position; missing mechanic: relative floor change on use. | ids 20573 |
| `data-otservbr-global/scripts/actions/other/baking.lua`<br/>_action_ · idx 0 | E | The whole bread/cake/garlic baking chain (flour, dough, ovens, millstones, sugar oat); missing mechanic: use-with crafting chains. | ids 3603, 3604, 3605, 6276, 8018, 8195, 8196, 8198 …(+1) |
| `data-otservbr-global/scripts/actions/other/birdcage.lua`<br/>_action_ · idx 0 | F | 1% chance the bird escapes (transform + achievement), otherwise just a chirp effect. | ids 2976 |
| `data-otservbr-global/scripts/actions/other/catch_fish.lua`<br/>_action_ · idx 0 | E | 10% chance to catch a golden fish into the bowl; missing mechanic: random use-with outcome. | ids 5928 |
| `data-otservbr-global/scripts/actions/other/construction_kits.lua`<br/>_action_ · idx 0 | C | House construction kits, plus a Jack Future questline branch (QuestLine == 3) that places quest furniture and flags per-item storages. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/other/create_sugar_oat.lua`<br/>_action_ · idx 0 | E | Combines sugar cane with wheat into sugar oat, consuming both; missing mechanic: use-with crafting. | ids 5466 |
| `data-otservbr-global/scripts/actions/other/destroy.lua`<br/>_action_ · idx 0 | C | Generic destroy-item handler, plus an Arito's Task branch that (given the quest storage) plants a scimitar at a fixed position and re-seals the cave entrance after 60s. | ids 3294 |
| `data-otservbr-global/scripts/actions/other/down_floor.lua`<br/>_action_ · idx 0 | E | Action id 102 tiles move the player one floor down and one east; missing mechanic: relative floor change on use (aids stamped by item.lua ItemAction). | aids 102; stamped by item.lua:Action |
| `data-otservbr-global/scripts/actions/other/dryad_garden.lua`<br/>_action_ · idx 0 | E | Two unique-id objects teleport the player into/out of the dryad garden with a water splash; missing mechanic: teleport-on-use. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/other/enchanting.lua`<br/>_action_ · idx 0 | C | Gem/altar enchanting, including the Elemental Spheres machine branch that counts gems into MachineGemCount storage behind ElementalSpheres.QuestLine. | ids 675, 676, 677, 678 |
| `data-otservbr-global/scripts/actions/other/fish_tank.lua`<br/>_action_ · idx 0 | F | Plays effect 175 on the fish tank. | ids 23691 |
| `data-otservbr-global/scripts/actions/other/fluids.lua`<br/>_action_ · idx 0 | E | The whole fluid system (pour, fill, drink, drunk/poison conditions, pools) plus a gravestone teleport branch; missing mechanic: fluid containers and conditions. | ids 2524, 2873, 2874, 2875, 2876, 2877, 2879, 2880 …(+13) |
| `data-otservbr-global/scripts/actions/other/gems.lua`<br/>_action_ · idx 0 | C | Gem use dispatch driven by several questlines: Lion's Rock field counter, Kilmaresh ivory mask flags, Threatened Dreams shrine teleports; heavy storage state machine. | ids 9057 |
| `data-otservbr-global/scripts/actions/other/kits.lua`<br/>_action_ · idx 0 | E | Unwraps a present/decoration kit inside a house; missing mechanic: house ownership check (partially covered by handleDecorationKitUse). | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/other/magic_tree.lua`<br/>_action_ · idx 0 | E | Toggles a magic tree/house decoration pair on a 1s per-player exhaustion; missing mechanic: house furniture toggles. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/other/mechanical_fishing.lua`<br/>_action_ · idx 0 | E | Mechanical fishing on water: weighted loot tiers, fishing skill tries, ownership checks; missing mechanic: extended fishing loot. | ids 9306 |
| `data-otservbr-global/scripts/actions/other/music.lua`<br/>_action_ · idx 0 | C | Instruments normally just play a sound effect, but the lyre (Diapason) and panpipes (Threatened Dreams) branches are 24h/20h storage-timed quest steps. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/other/ore_wagon.lua`<br/>_action_ · idx 0 | E | Ten unique-id ore wagons teleport the player around the Beregar mine; missing mechanic: teleport-on-use. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/other/rafzane_elevator.lua`<br/>_action_ · idx 0 | E | Winch elevator: relocates the whole tile stack, transforms cage items, plays a yell and teleports the rider; missing mechanic: tile relocation + teleport-on-use. | ids 17940, 17944 |
| `data-otservbr-global/scripts/actions/other/special_boxes.lua`<br/>_action_ · idx 0 | E | Opens an event box into a random gift with a prismatic effect; missing mechanic: random reward tables. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/other/string_of_mending.lua`<br/>_action_ · idx 0 | E | 50/50 repairs a ring of ending or destroys it; missing mechanic: random use-with outcome. | ids 20208 |
| `data-otservbr-global/scripts/actions/other/teleport_draw_well.lua`<br/>_action_ · idx 0 | E | Draw wells with actionid 1000 drop the player one floor; missing mechanic: relative floor change on use. | ids 1931 |
| `data-otservbr-global/scripts/actions/other/teleport_item.lua`<br/>_action_ · idx 0 | E | Unique ids 15001-20000 teleport the player to a destination from the TeleportItemUnique table with a per-entry effect; missing mechanic: teleport-on-use destination table (data lives in startup/tables/teleport_item.lua). | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/other/temple_scroll.lua`<br/>_action_ · idx 0 | E | Teleports the player to their town temple unless PZ-locked/in fight, and is consumed; missing mechanic: teleport-on-use + fight state check. | ids 25718 |
| `data-otservbr-global/scripts/actions/other/thais_exhibition.lua`<br/>_action_ · idx 0 | F | Thais museum exhibits: each display plays effects, says a line and sometimes transforms for a few seconds - pure flavour. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/other/trap.lua`<br/>_action_ · idx 0 | A | Using a sprung trap (3482) re-arms it (transform to 3481) with a puff - one-line quest-touch entry. | ids 3482 |
| `data-otservbr-global/scripts/actions/other/world_board.lua`<br/>_action_ · idx 0 | E | Reads global storages for active world changes (fury gates, Yasir, nightmare isles) and reports them; missing mechanic: server-wide world change state. | ids 19236 |
| `data-otservbr-global/scripts/actions/rookgaard/bear_room_quest/bear_room_quest_lever.lua`<br/>_action_ · idx 0 | A | Lever removes the blocking stone at (32145,32101,11) or pushes creatures aside and recreates it - quest-touch (remove/create + lever toggle). | uids 1056; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/actions/rookgaard/bear_room_quest/bear_room_quest_stone.lua`<br/>_action_ · idx 0 | A | Same bear-room stone toggle bound to action id 30006 instead of the unique id. | aids 30006; stamped by lever.lua:Action, lever.lua:Unique |
| `data-otservbr-global/scripts/actions/rookgaard/chest.lua`<br/>_action_ · idx 0 | B | Grants a wooden sword once per character, gated on raw storage 405492, with "The chest is empty." afterwards - a plain chest definition. | aids 30492; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/actions/rookgaard/goblin_temple_quest.lua`<br/>_action_ · idx 0 | B | Gives a bag with a pan + 4 snowballs + vial of milk once per character (questKV "goblintemple2"). | uids 14050; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/actions/rookgaard/goblin_temple_quest.lua`<br/>_action_ · idx 0 | B | Gives a bag with sandals + 5 small stones + 50 gold once per character (questKV "goblintemple"). | uids 14049; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/actions/rookgaard/katana_quest/katana_quest_door.lua`<br/>_action_ · idx 0 | A | Re-opens the katana room door (5108->5107) and resets the lever, re-stamping the unique id on the door. | uids 22006; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/actions/rookgaard/katana_quest/katana_quest_lever.lua`<br/>_action_ · idx 0 | A | Lever closes/opens the katana room door, relocating anything standing in the doorway - quest-touch plus unique-id restamping. | uids 30029; stamped by lever.lua:Unique |
| `data-otservbr-global/scripts/actions/rookgaard/rapier_quest.lua`<br/>_action_ · idx 0 | B | Gives a rapier once per character via canGetReward/questKV "rapier" and takes a treasure screenshot. | uids 14042; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/actions/rookgaard/sewer_lever.lua`<br/>_action_ · idx 0 | A | Rookgaard sewer bridge lever: transforms the ground tiles, creates/removes the bridge items and relocates creatures/items off the span. | aids 50239; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/actions/roshamuul/prison/golden.lua`<br/>_action_ · idx 0 | E | Prison boss lever: needs 5 players on the tiles, a 20h per-player cooldown storage and a global room-busy storage, spawns the boss and clears the room on a timer; missing mechanic: boss arenas. | ids 20273 |
| `data-otservbr-global/scripts/actions/roshamuul/prison/keys.lua`<br/>_action_ · idx 0 | E | Prison cell keys spawn a boss, teleport the user in, consume the key and clear the room after 15 minutes; missing mechanic: boss arenas + timers. | ids 20270, 20271, 20272 |
| `data-otservbr-global/scripts/actions/shrines/feyrist_exit.lua`<br/>_action_ · idx 0 | E | Four exit objects teleport the player out of the Feyrist shrines with an element-specific effect; missing mechanic: teleport-on-use. | aids 24999, 25000, 25001, 25002; stamped by tile.lua:Action |
| `data-otservbr-global/scripts/actions/soulpit/soulpit_arena_exit.lua`<br/>_action_ · idx 0 | E | Position-registered exit teleports the player out of the Soulpit arena; missing mechanic: teleport-on-use at a position. | 1 map position(s) |
| `data-otservbr-global/scripts/actions/soulpit/soulpit_entrance.lua`<br/>_movement_ · idx 0 | D | Step-in tile teleports the player back out of the Soulpit. | 1 map position(s) |
| `data-otservbr-global/scripts/actions/soulpit/soulpit_entrance.lua`<br/>_movement_ · idx 0 | D | Step-in tile teleports the player into the Soulpit. | 1 map position(s) |
| `data-otservbr-global/scripts/actions/tools/bricklayer_kit.lua`<br/>_action_ · idx 0 | E | On the aid-40027 wall, consumes 3 wood + 3 clay and creates two wall items at fixed positions; missing mechanic: multi-item consumption on use-with. | ids 7785 |
| `data-otservbr-global/scripts/actions/tools/grinder.lua`<br/>_action_ · idx 0 | E | Delegates to onGrindItem for grindable items; missing mechanic: shared grinding table. | ids 16122 |
| `data-otservbr-global/scripts/actions/tools/hammer.lua`<br/>_action_ · idx 0 | C | Repairs broken walls (5 fixed positions) advancing RottinWood.RottinStart storage with a daily cap and restores the broken wall after 2 minutes; also a KLING KLONG anvil branch. | ids 3460 |
| `data-otservbr-global/scripts/actions/tools/juice_squeezer.lua`<br/>_action_ · idx 0 | E | Squeezes fruit into a flask of juice, consuming an empty flask; missing mechanic: use-with crafting. | ids 5865 |
| `data-otservbr-global/scripts/actions/tools/lock_pick.lua`<br/>_action_ · idx 0 | C | On the aid-12503 chest: 30% success advances Thieves Guild Mission02 storage and gives the item, 70% breaks the lock pick. | ids 7889 |
| `data-otservbr-global/scripts/actions/tools/metal_file.lua`<br/>_action_ · idx 0 | E | Files two key fragments into polished fragments; missing mechanic: use-with transform. | ids 27270 |
| `data-otservbr-global/scripts/actions/tools/rake.lua`<br/>_action_ · idx 0 | C | Rakes clay, and on the Shattered Isles sand pile (given TheGovernorDaughter == 1) creates the ring at a fixed position and advances the storage to 2. | ids 3452 |
| `data-otservbr-global/scripts/actions/tools/saw.lua`<br/>_action_ · idx 0 | E | Saws a wooden log into a plank; missing mechanic: use-with transform. | ids 3461 |
| `data-otservbr-global/scripts/actions/tools/skinning.lua`<br/>_action_ · idx 0 | E | The full skinning/carving table (obsidian knife, blessed steel), including Botany questline steps and a 4h Mutated Pumpkin storage timer; missing mechanic: skinning tables (+ some quest storages). | ids 5908, 5942 |
| `data-otservbr-global/scripts/actions/tools/spiked_squelcher.lua`<br/>_action_ · idx 0 | E | Delegates to onUseSpikedSquelcher; missing mechanic: shared weapon-tool table. | ids 7452 |
| `data-otservbr-global/scripts/actions/valuables/random_items.lua`<br/>_action_ · idx 0 | E | Opens valuables/bags into weighted random items with per-bag effects and flavour text; missing mechanic: weighted loot tables. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/actions/worldchanges/deeplings/bosses_reward.lua`<br/>_action_ · idx 0 | C | Deepling boss chests (uids 9302-9304) only open when the per-player boss-kill storage is 1, then hand out the loot and reset the storage to 0 - chest-shaped but gated on a boss-kill storage. | uids 9302, 9303, 9304; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/actions/worldchanges/the_mummys_curse/horestis_jars.lua`<br/>_action_ · idx 0 | E | Five canopic jars must be emptied in the right order; the last one spawns Horestis, walls the room in after 61s and drops loot pillars 20 minutes later; missing mechanic: multi-step ritual + boss + long timers. | aids 50006, 50007, 50008, 50009, 50010; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/creaturescripts/customs/freequests.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - optional server setting that stamps a large table of quest storages onto every character on login; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/customs/reward_exercise.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - login hint about the !reward exercise weapon command; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/gaz_haragoth_heal.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - boss self-heal below 12.5% hp with a yell; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/grand_master_oberon_immunity.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - boss damage immunity phase with a holy effect; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/greater_minion.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - minion upgrades itself into a greater death minion after 7s; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/hirintror_heal.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - boss survives its first death with a regeneration condition; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/invulnerable.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - generic monster invulnerability toggle helper; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/minion_gaz_haragoth_vortex.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - minion death drops a 1-minute vortex teleport item; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/mirror_image_transform.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - mirror image morphs into the attacker's vocation apparition; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/necromantic_minion.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - minion converts into necromantic energy after 7s; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/northern_pike.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - 50% chance to spawn a slippery northern pike on death; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/omrafir_explode.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - boss explodes into hellfire fighters and reforms at hp thresholds; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/shared_life.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - shared health pool across a group of monsters; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/shargon_growth_check.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - boss detects trap fields nearby and floods the room with Death Reapers; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/shlorg_teleport.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - boss randomly teleports between four spawn points; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/superior_minion.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - minion converts into a superior death minion after 7s; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/the_pale_count_kill.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - boss flees below 75% hp and respawns in its sanctuary; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/the_welter_egg.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - egg hatches into a spawn of the welter after 10s; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/white_pale_heal.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - boss survives its first death with a regeneration condition; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/monster/zavarash_hide.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - boss hides (invisible + hidden health) until hit by a damage-over-time condition; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/others/dawnport.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - level advance on Dawnport warns and eventually force-teleports the player to the temple; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/others/droploot.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - blessing-aware loot dropping on player death; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/others/login.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - premium expiry: relocates non-premium players to a free town and revokes houses; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/others/login_events.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - registers RookgaardAdvance/HealthPillar/YalahariHealth on login; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/creaturescripts/others/rookgaard_advance.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - level 8 hint to visit the Oracle; missing mechanic: the corresponding engine subsystem. | — |
| `data-otservbr-global/scripts/movements/oramond/oramond_entrance.lua`<br/>_movement_ · idx 0 | D | Step-in on the two portal uniques teleports the player between the Oramond entrance and exit with a "Slrrp!" line. | uids 50500, 50501; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/movements/oramond/oramond_movements.lua`<br/>_movement_ · idx 0 | D | Big action-id keyed step-in teleport table (~50 destinations across Oramond, Krailos, Liberty Bay quaras, trainers, Svargrond). | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/oramond/oramond_teleport.lua`<br/>_movement_ · idx 0 | D | Six action-id keyed step-in teleports between Oramond, Glooth and the city. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/oramond/seacrest.lua`<br/>_movement_ · idx 0 | D | Diving tile: teleports the player to the seacrest grounds only when wearing a helmet of the deep/depth galea, else pushes them back with a message. | uids 1110; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/movements/oramond/teleport.lua`<br/>_movement_ · idx 0 | D | Eight action-id keyed step-in teleports (catacombs/minos/golem) with an optional premium flag. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/oramond/voting_oramond.lua`<br/>_movement_ · idx 0 | E | The destination depends on the real-world weekday (Oramond voting rotation); missing mechanic: scheduled/rotating world state. | aids 42628; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/movements/others/dawnport_tiles.lua`<br/>_movement_ · idx 0 | C | Blocks the temple stairs once Dawnport.DoorVocation is set (or level >= 20), teleporting the player back. | aids 25009; stamped by tile.lua:Action, tile.lua:Unique |
| `data-otservbr-global/scripts/movements/others/dawnport_tiles.lua`<br/>_movement_ · idx 0 | C | First tutorial tile: sets Dawnport.Questline = 1 and GoMain = 1 and prints the welcome message. | 1 map position(s) |
| `data-otservbr-global/scripts/movements/others/dawnport_tiles.lua`<br/>_movement_ · idx 0 | C | Further tutorial hint tile keyed on the Dawnport tutorial storage. | 1 map position(s) |
| `data-otservbr-global/scripts/movements/others/dawnport_tiles.lua`<br/>_movement_ · idx 0 | C | Stairs tutorial hint keyed on Dawnport.Tutorial storage. | 1 map position(s) |
| `data-otservbr-global/scripts/movements/others/dawnport_tiles.lua`<br/>_movement_ · idx 0 | C | Vocation chest room entry/exit tiles: checks the player vocation and Dawnport.VocationReward storage to either nudge them at the chest or eject them. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/others/dawnport_tiles.lua`<br/>_movement_ · idx 0 | D | Action id 20001 tiles cure the Dawnport poison condition on step-in (positions stamped by tile.lua TileAction). | aids 20001; stamped by corpse.lua:Action, corpse.lua:Unique, tile.lua:Action |
| `data-otservbr-global/scripts/movements/others/dawnport_tiles.lua`<br/>_movement_ · idx 0 | D | Tutorial tile that prints the outpost hint and plays tutorial arrow/square effects. | 1 map position(s) |
| `data-otservbr-global/scripts/movements/others/dawnport_tiles.lua`<br/>_movement_ · idx 0 | D | Two ids act as one-way step-in teleports out of the tutorial cave with a flavour line. | ids 20344, 21374 |
| `data-otservbr-global/scripts/movements/others/dawnport_vocation_trial.lua`<br/>_movement_ · idx 0 | C | Vocation trial rooms: per-vocation storage marks the first visit, hands out a full starter kit (weapons/armor/runes) and prints the trial message. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/others/remove-create_item.lua`<br/>_movement_ · idx 0 | D | Step-in on a TileUnique tile (uids 29001-30000) removes a configured item at a configured target position. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/others/remove-create_item.lua`<br/>_movement_ · idx 1 | D | Step-out recreates that item - the movement twin of quest-touch, fully data-driven from startup/tables/tile.lua TileUnique. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/others/teleport.lua`<br/>_movement_ · idx 0 | D | Unique ids 38001-40000 are step-in teleports whose destination/effect come from the TeleportUnique table. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/others/walkback.lua`<br/>_movement_ · idx 0 | D | Quest/reward containers and blocked tiles bounce normal players back to where they came from (or to their temple). | ids 2431, 2432, 2433, 2434, 2469, 2472, 2473, 2478 …(+11) |
| `data-otservbr-global/scripts/movements/rookgaard/level_bridge.lua`<br/>_movement_ · idx 0 | D | Rookgaard bridge pushes players below level 2 back with a message. | aids 50998; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/movements/rookgaard/premium_bridge.lua`<br/>_movement_ · idx 0 | D | Rookgaard premium bridge pushes free accounts back. | aids 50241; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/movements/rookgaard/rook_village.lua`<br/>_movement_ · idx 0 | D | Stepping on id 7888 pushes the player 3 north / 1 floor up with "You don't have any business there anymore." | ids 7888 |
| `data-otservbr-global/scripts/movements/roshamuul/strange_vortex_tp.lua`<br/>_movement_ · idx 0 | D | Step-in vortex teleports the player into the nightmare area with a message. | aids 33542; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/movements/teleport/adventurers_guild.lua`<br/>_movement_ · idx 0 | C | Guild exit teleport sends the player to the town recorded in AdventurersGuild.Stone storage (else their own town) and clears the storage. | aids 4253; stamped by teleport.lua:Action |
| `data-otservbr-global/scripts/movements/teleport/candia.lua`<br/>_movement_ · idx 0 | D | Four position-registered step-in teleports between Candia and Feyrist with a candy-floss effect. | 1 map position(s) |
| `data-otservbr-global/scripts/movements/teleport/citizen.lua`<br/>_movement_ · idx 0 | C | Citizenship tiles set the player town, but Svargrond first requires BarbarianTest.Questline >= 8 (key is in our quest catalog). | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/teleport/citizen_svargrond.lua`<br/>_movement_ · idx 0 | C | Roof access teleport requires BarbarianTest.Questline == 8, otherwise drops the player below with a hint. | aids 30032; stamped by lever.lua:Unique, teleport.lua:Action |
| `data-otservbr-global/scripts/movements/teleport/dark_cathedral_teleports.lua`<br/>_action_ · idx 0 | A | Dark Cathedral lever: transforms 2772->2773 and reverts itself after 10 minutes ("It doesn't move." when already pulled) - quest-touch with a long timed restore. | aids 30004; stamped by lever.lua:Action, lever.lua:Unique |
| `data-otservbr-global/scripts/movements/teleport/dark_cathedral_teleports.lua`<br/>_movement_ · idx 0 | D | The two cathedral teleport tiles route the player based on which lever/tile they stepped on. | uids 35021, 35022; stamped by teleport.lua:Unique |
| `data-otservbr-global/scripts/movements/teleport/deeper_banuta_shortcut_teleport.lua`<br/>_movement_ · idx 0 | C | Deeper Banuta shortcut teleports only work when BanutaSecretTunnel.DeeperBanutaShortcut storage is 1, otherwise the player is bounced back. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/teleport/dragolisk_teleport.lua`<br/>_movement_ · idx 0 | D | Two position-registered step-in teleports in and out of the Dragolisk cave. | 2 map position(s) |
| `data-otservbr-global/scripts/movements/teleport/fibula.lua`<br/>_movement_ · idx 0 | D | Two action-id keyed step-in teleports (Fibula/Glooth) with per-entry effects. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/teleport/gnomprona.lua`<br/>_movement_ · idx 0 | D | Gnomprona/Dangerous Depths teleport network; one route additionally requires PrimalOrdeal MagmaBubbleKilled storage, else "You don't have access to this teleport yet." | 2 map position(s) |
| `data-otservbr-global/scripts/movements/teleport/gray_beach_vortex.lua`<br/>_movement_ · idx 0 | D | Two unique-id vortices teleport the player under the rocks with a water splash and message. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/teleport/item_teleports.lua`<br/>_movement_ · idx 0 | E | onAddItem: an item dropped on an aid-tagged teleport tile is moved to the destination from the ItemTeleports table; missing mechanic: item (not creature) teleports on add. | ids 1949, 1959 |
| `data-otservbr-global/scripts/movements/teleport/magician_quarter.lua`<br/>_movement_ · idx 0 | D | Magician quarter walls teleport the player through only if elemental soil is sacrificed on the tile, else push them back with a line. | aids 7813; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/movements/teleport/oskayaat.lua`<br/>_action_ · idx 0 | E | Position-registered boat entry teleports the player onto the Oskayaat boat. | 1 map position(s) |
| `data-otservbr-global/scripts/movements/teleport/oskayaat.lua`<br/>_action_ · idx 0 | E | Position-registered boat exit teleports the player to the mainland dock. | 1 map position(s) |
| `data-otservbr-global/scripts/movements/teleport/oskayaat.lua`<br/>_action_ · idx 0 | E | Position-registered wall passage teleports the player north/south depending on which side they stand. | 1 map position(s) |
| `data-otservbr-global/scripts/movements/teleport/port_hope_deathling.lua`<br/>_movement_ · idx 0 | D | Two action-id keyed step-in teleports in/out of the Port Hope deathling cave. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/teleport/roshamuul_carpet.lua`<br/>_movement_ · idx 0 | D | Flying carpet tile returns the player to the Thais temple with a message. | aids 4256; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/movements/teleport/schrodingers_island_teleport_lvl_999.lua`<br/>_movement_ · idx 0 | D | Step-in teleport that requires level 999, otherwise bounces the player back. | aids 15998; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/movements/teleport/schrodingers_island_teleport_lvl_999_exit.lua`<br/>_movement_ · idx 0 | D | Exit teleport for the same level-999 island. | aids 15999; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/movements/teleport/shrine_entrance.lua`<br/>_movement_ · idx 0 | C | Elemental shrine portals require level 30 and record which shrine was entered in Storage.ShrineEntrance so the exit knows where to send you. | 4 map position(s) |
| `data-otservbr-global/scripts/movements/teleport/shrine_exit.lua`<br/>_movement_ · idx 0 | C | Reads Storage.ShrineEntrance to teleport the player back to the matching shrine entrance, falling back to their temple. | 1 map position(s) |
| `data-otservbr-global/scripts/movements/teleport/sorcerer_guild_thais.lua`<br/>_movement_ · idx 0 | D | Non-sorcerers stepping on the guild tile are teleported outside. | aids 5555; stamped in the OTBM map, not by a startup table |
| `data-otservbr-global/scripts/movements/teleport/teleport_ab_dendriel.lua`<br/>_movement_ · idx 0 | D | Six action-id keyed step-in teleports around Ab'Dendriel with a puff effect. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/teleport/turtles.lua`<br/>_movement_ · idx 0 | C | Eight unique-id turtle-shell teleports between the Shattered Isles; the Laguna route additionally requires TheShatteredIsles.AccessToLagunaIsland storage. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/teleport/vengoth_teleport.lua`<br/>_movement_ · idx 0 | D | Ten action-id keyed step-in teleports around Vengoth castle with a purple energy effect. | dynamic selectors (table-driven) |
| `data-otservbr-global/scripts/movements/teleport/yalahar_demon.lua`<br/>_movement_ · idx 0 | D | Yalahar flame passages consume the elemental soil placed on the sacrifice tile, else push the player back with an energy hit. | dynamic selectors (table-driven) |
| `data/scripts/actions/doors/quest_door.lua`<br/>_action_ · idx 0 | C | Opens a sealed quest door only when the player storage key equal to the door actionId is set, else prints "The door seems to be sealed against unwanted intruders."; door ids come from QuestDoorTable. | dynamic selectors (table-driven) |
| `data/scripts/actions/items/banana_chocolate_shake.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies happy message + hearts effect behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 9083 |
| `data/scripts/actions/items/bed_modification_kits.lua`<br/>_action_ · idx 0 | E | Transforms an adjacent house bed pair into another bed model; missing mechanic: house furniture/bed system. | dynamic selectors (table-driven) |
| `data/scripts/actions/items/blessed_steak.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies refills mana behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 9086 |
| `data/scripts/actions/items/blessing_charms.lua`<br/>_action_ · idx 0 | E | Delegates to Blessings.useCharm; missing mechanic: blessing system. | ids 10341, 10342, 10343, 10344, 10345, 25360, 25361 |
| `data/scripts/actions/items/blueberry_bush.lua`<br/>_action_ · idx 0 | A | Uses a blueberry bush: transforms 3699->3700, starts decay back, drops 3 blueberries on the tile - fits quest-touch (transform + create + timed restore), keyed by item id not position. | ids 3699 |
| `data/scripts/actions/items/blueberry_cupcake.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies refills mana behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 28484 |
| `data/scripts/actions/items/carrot_cake.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies +10 distance skill for 1h behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 9087 |
| `data/scripts/actions/items/change_gold.lua`<br/>_action_ · idx 0 | E | Converts a stack of 100 coins up/down a denomination; missing mechanic: currency stack exchange on use. | dynamic selectors (table-driven) |
| `data/scripts/actions/items/check_bless.lua`<br/>_action_ · idx 0 | E | Delegates to Blessings.checkBless; missing mechanic: blessing system. | ids 6561, 11468 |
| `data/scripts/actions/items/clay_lump.lua`<br/>_action_ · idx 0 | E | Random pottery result with a per-player description attribute and achievement; missing mechanic: item custom description + achievements. | ids 10422 |
| `data/scripts/actions/items/cobra_flask.lua`<br/>_action_ · idx 0 | E | Full flask (31296) poured into a cobra basin: green smoke, message, transforms to empty and sets a GLOBAL 30-min storage cooldown; missing mechanic: global (server-wide) storage timers. | ids 31296 |
| `data/scripts/actions/items/cobra_flask.lua`<br/>_action_ · idx 1 | E | Empty flask (31297) refilled by using it on a water source; missing mechanic: item consumption/transform on use-with. | ids 31297 |
| `data/scripts/actions/items/coconut_shrimp_bake.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies 24h underwater speed buff, requires helmet of the deep behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 11584 |
| `data/scripts/actions/items/cup_of_molten_gold.lua`<br/>_action_ · idx 0 | E | Pours molten gold on a fir cone to gild it (chance of failure); missing mechanic: use-with crafting with consumption. | ids 12804 |
| `data/scripts/actions/items/demonic_candy_ball.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies random buff/light/invisible/outfit behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 11587 |
| `data/scripts/actions/items/die.lua`<br/>_action_ · idx 0 | F | Rolls 1-6, transforms the die, broadcasts the roll to nearby players and tracks a "three sixes" achievement. | dynamic selectors (table-driven) |
| `data/scripts/actions/items/exercise_training_weapons.lua`<br/>_action_ · idx 0 | E | Starts the exercise-dummy training loop (skill/mana tries per swing, PZ and dummy checks); missing mechanic: full training loop (our ExerciseTrainingHandler is a partial subset). | dynamic selectors (table-driven) |
| `data/scripts/actions/items/ferumbras_amulet.lua`<br/>_action_ · idx 0 | E | Equipped amulet heals or restores 1000 then transforms to the drained variant and decays back; missing mechanic: item charge/decay recharge. | ids 22767, 22768 |
| `data/scripts/actions/items/ferumbras_mana_keg.lua`<br/>_action_ · idx 0 | E | Grants 10 ultimate mana potions then goes on a decay-based recharge; missing mechanic: item decay recharge. | ids 22769, 22770 |
| `data/scripts/actions/items/fiery_horseshoe.lua`<br/>_action_ · idx 0 | E | Counts 4 horseshoes in player kv and grants mount 184 + achievement; missing mechanic: mounts + per-player kv counters. | dynamic selectors (table-driven) |
| `data/scripts/actions/items/filled_jalapeno_peppers.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies haste 1h behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 9085 |
| `data/scripts/actions/items/garlic_bread.lua`<br/>_action_ · idx 0 | F | Says a flavour line and does nothing else. | ids 8194 |
| `data/scripts/actions/items/glooth_bag.lua`<br/>_action_ · idx 0 | E | Opens a bag into a weighted random reward; missing mechanic: weighted loot tables on use. | ids 21203 |
| `data/scripts/actions/items/gold_converter.lua`<br/>_action_ · idx 0 | E | Charged converter that exchanges a targeted coin stack and burns a charge; missing mechanic: charged tool items. | ids 23722, 25719 |
| `data/scripts/actions/items/hydra_tongue_salad.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies clears 10 condition types behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 9080 |
| `data/scripts/actions/items/ladder_up.lua`<br/>_action_ · idx 0 | E | Use a ladder/rope-up item to move the player one floor up with a PZ-lock guard; missing mechanic: use-triggered floor change (map transitions cover part of this). | ids 435 |
| `data/scripts/actions/items/lemon_cupcake.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies +10 distance for 1h behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 28486 |
| `data/scripts/actions/items/lottery_ticket.lua`<br/>_action_ · idx 0 | E | 1-in-98 transforms into a winning ticket, otherwise consumed; missing mechanic: random consumable outcomes. | ids 5957 |
| `data/scripts/actions/items/magic_gold_converter.lua`<br/>_action_ · idx 0 | E | Toggles an auto-converter that walks the backpack every 300ms converting coins; missing mechanic: repeating per-player timers over container contents. | ids 28525, 28526 |
| `data/scripts/actions/items/muck_remover.lua`<br/>_action_ · idx 0 | E | Dissolves muck (16102) and drops a random item; missing mechanic: use-with consumption + random drop. | ids 16101 |
| `data/scripts/actions/items/northern_fishburger.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies +50 fishing for 1h behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 9088 |
| `data/scripts/actions/items/piggy_bank.lua`<br/>_action_ · idx 0 | E | 1-in-6 breaks the bank for a gold coin, else yields a platinum coin; missing mechanic: random consumable outcomes + achievements. | ids 2995 |
| `data/scripts/actions/items/pot_of_blackjack.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies heals 5000, kv gulp counter behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 11586 |
| `data/scripts/actions/items/premium_scroll.lua`<br/>_action_ · idx 0 | E | Adds 30 premium days; missing mechanic: premium account time. | ids 14758 |
| `data/scripts/actions/items/reward_bags.lua`<br/>_action_ · idx 0 | E | Opens a reward bag into a random item, routed to backpack or store inbox, with a Discord webhook announcement; missing mechanic: store inbox + webhooks. | dynamic selectors (table-driven) |
| `data/scripts/actions/items/roasted_dragon_wings.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies +10 shielding for 1h behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 9081 |
| `data/scripts/actions/items/roasted_meat.lua`<br/>_action_ · idx 0 | E | Uses raw meat on a campfire to roast it; missing mechanic: use-with transform against a map item. | ids 22186 |
| `data/scripts/actions/items/rotworm_stew.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies refills health behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 9079 |
| `data/scripts/actions/items/rust_remover.lua`<br/>_action_ · idx 0 | E | Restores/destroys rusted armor variants by table; missing mechanic: use-with transform with failure chance. | ids 9016 |
| `data/scripts/actions/items/scroll_of_ascension.lua`<br/>_action_ · idx 0 | F | Gives the player a Demon/Ferumbras outfit for 5 minutes on a 1h exhaustion; purely cosmetic. | ids 22771 |
| `data/scripts/actions/items/spellbook.lua`<br/>_action_ · idx 0 | E | Opens the spell list window; missing mechanic: spellbook UI. | ids 3059, 6120, 8072, 8073, 8074, 8075, 8076, 8090 …(+11) |
| `data/scripts/actions/items/spiritual_horseshoe.lua`<br/>_action_ · idx 0 | E | Counts 4 horseshoes in kv and grants mount 217; missing mechanic: mounts + kv counters. | dynamic selectors (table-driven) |
| `data/scripts/actions/items/store_coins.lua`<br/>_action_ · idx 0 | E | Adds Tibia coins to the account balance; missing mechanic: store currency. | dynamic selectors (table-driven) |
| `data/scripts/actions/items/strawberry_cupcake.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies refills health behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 28485 |
| `data/scripts/actions/items/sweet_mangonaise_elixir.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies duplicates the equipped ring behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 11588 |
| `data/scripts/actions/items/sweetheart_ring.lua`<br/>_action_ · idx 0 | F | Shows a hearts effect when the ring is worn. | ids 21955 |
| `data/scripts/actions/items/tropical_fried_terrorbird.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies +5 magic level for 1h behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 9082 |
| `data/scripts/actions/items/usable_phantasmal_jade_items.lua`<br/>_action_ · idx 0 | E | Collects 4 horseshoes + saddle + tac in kv and grants mount 167; missing mechanic: mounts + kv counters. | dynamic selectors (table-driven) |
| `data/scripts/actions/items/veggie_casserole.lua`<br/>_action_ · idx 0 | E | Consumes the food and applies +10 melee for 1h behind a named 10-min player exhaustion; missing mechanic: player-scoped named exhaustion + timed attribute conditions. | ids 9084 |
| `data/scripts/actions/items/vessels.lua`<br/>_action_ · idx 0 | F | Plays a boss-themed magic effect on a targeted player and is consumed. | dynamic selectors (table-driven) |
| `data/scripts/actions/items/water_pipe.lua`<br/>_action_ · idx 0 | F | Plays a puff effect. | ids 2974, 2980, 21323 |
| `data/scripts/actions/items/wheel_scrolls.lua`<br/>_action_ · idx 0 | E | Grants Wheel of Destiny promotion points at level 51+; missing mechanic: wheel of destiny. | dynamic selectors (table-driven) |
| `data/scripts/actions/objects/bath_tub_drain.lua`<br/>_action_ · idx 0 | E | Empties a filled bathtub if nobody stands in it; missing mechanic: house furniture state. | dynamic selectors (table-driven) |
| `data/scripts/actions/objects/carpets.lua`<br/>_action_ · idx 0 | E | Rolls/unrolls house carpets with tile stacking rules; missing mechanic: house decoration. | dynamic selectors (table-driven) |
| `data/scripts/actions/objects/cask_and_kegs.lua`<br/>_action_ · idx 0 | E | Charged cask converts empty flasks into potions in bulk; missing mechanic: charged containers + bulk inventory swaps. | dynamic selectors (table-driven) |
| `data/scripts/actions/objects/daily_reward_shrine.lua`<br/>_action_ · idx 0 | E | Opens the daily reward window; missing mechanic: daily reward calendar. | ids 25720, 25721, 25722, 25723, 25802, 25803 |
| `data/scripts/actions/objects/exaltation_forge.lua`<br/>_action_ · idx 0 | E | Opens the exaltation forge; missing mechanic: forge system. | ids 37122, 37128, 37129, 37131, 37132, 37133, 37153, 37157 |
| `data/scripts/actions/objects/hive_gates.lua`<br/>_action_ · idx 0 | E | Steps the player through a hive gate to the opposite side; missing mechanic: teleport-on-use (destination computed from the used tile). | ids 13278, 13279, 13280, 13281, 13282, 13283, 13290, 13291 …(+3) |
| `data/scripts/actions/objects/large_seashell.lua`<br/>_action_ · idx 0 | E | Once per 20h: 16% self-damage, 48% pearl, else nothing, then transforms and decays; missing mechanic: long player exhaustion + self-damage on use. | ids 197 |
| `data/scripts/actions/objects/offline_training_book.lua`<br/>_action_ · idx 0 | F | Shows an informational text dialog. | ids 11441 |
| `data/scripts/actions/objects/skill_trainer.lua`<br/>_action_ · idx 0 | E | Logs the player out into offline training on a chosen skill; missing mechanic: offline training. | dynamic selectors (table-driven) |
| `data/scripts/actions/objects/wall_mirror.lua`<br/>_action_ · idx 0 | F | Says one of eleven random vanity lines on a 20h exhaustion. | ids 2603, 2604, 2630, 2631, 2633, 2634, 2636, 2637 |
| `data/scripts/actions/objects/windows.lua`<br/>_action_ · idx 0 | E | Opens/closes house windows with ownership checks; missing mechanic: house permissions. | dynamic selectors (table-driven) |
| `data/scripts/actions/tools/claw_of_the_noxious_spawn.lua`<br/>_action_ · idx 0 | E | Equipped ring: 5% self-curse condition, else cures poison, then decays; missing mechanic: charge/decay + curse condition. | ids 9392 |
| `data/scripts/actions/tools/crowbar.lua`<br/>_action_ · idx 0 | C | The crowbar item is registered but onUseCrowbar dispatches only on quest storage values (levers/altars per quest); needs the storage engine before any branch fires. | ids 3304 |
| `data/scripts/actions/tools/crushers.lua`<br/>_action_ · idx 0 | E | Breaks a valid gem into fragments; missing mechanic: charged tool + gem fragment tables. | ids 46628 |
| `data/scripts/actions/tools/crushers.lua`<br/>_action_ · idx 0 | E | Charged crusher variant, consumed when charges run out; missing mechanic: charged tools. | ids 46627 |
| `data/scripts/actions/tools/kitchen_knife.lua`<br/>_action_ · idx 0 | E | Delegates to onUseKitchenKnife (corpse carving/food prep table); missing mechanic: shared skinning/carving table. | ids 3469 |
| `data/scripts/actions/tools/sickle.lua`<br/>_action_ · idx 0 | A | Cutting sugar cane (5463) transforms it to the stub 5462 with decay-back and creates a bunch of sugar cane on the tile - exactly quest-touch shaped (transform + create + timed restore). | ids 3293 |
| `data/scripts/actions/tools/spoon.lua`<br/>_action_ · idx 0 | E | Delegates to onUseSpoon (soup/food scooping); missing mechanic: shared tool table. | ids 3468 |
| `data/scripts/actions/tools/toolgear.lua`<br/>_action_ · idx 0 | E | Multi-tool that tries rope/shovel/pick/machete/crowbar/spoon/scythe/knife and 5% jams for a minute; missing mechanic: tool-of-tools dispatch + jam decay. | ids 9594, 9596, 9598 |
| `data/scripts/creaturescripts/familiar/on_advance.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - familiar system: grants the vocation familiar at level 200 premium; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/familiar/on_death.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - familiar system: records summon time and cancels familiar timers; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/familiar/on_login.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - familiar system: restores/creates the familiar with remaining time on login; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/monster/boss_lever_death.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - boss-lever zones: on boss death, announce, screenshot damagers and evict the zone after a delay; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/monster/forge_kill.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - forge system: fused/convergence monster death handling; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/monster/giant_spider_wyda_death.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - boss illusion line + achievement on death; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/monster/spawn_system.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - scripted spawn-object system: notifies the owning spawn on monster death; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/monster/spawn_system.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - scripted spawn-object system: tears down the spawn when its boss dies; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/monster/white_deer_death.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - on death, 30%/70% replaces the white deer with an enraged/desperate variant; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/monster/white_deer_scouts.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - 10% chance to spawn two Elf Scouts on death; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/others/#extended_opcode.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - extended opcode channel for custom clients; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/others/modal_window_helper.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - modal window callback dispatch; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/others/remove_empty_parcel.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - store inbox cleanup on login; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/player/adventure_blessing.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - adventurer blessing on login; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/player/death.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - player death: guild war scoring, death log rows, webhook announcements; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/player/login.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - login banner, boosted creature/boss lines, reward chest count, event registration; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/player/logout.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - logout bookkeeping; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/player/name_lock.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - name lock enforcement and store name-change prompt; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/player/offline_training.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - offline training payout on login; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/player/regenerate_stamina.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - offline stamina regeneration; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/player/send_first_items.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - starter equipment on first login; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/creaturescripts/player/update_player_on_advanced_level.lua`<br/>_creature-event_ · idx 0 | E | Creature/player event - refill hp/mana and persist on level advance; missing mechanic: the corresponding engine subsystem. | — |
| `data/scripts/movements/bath_tub.lua`<br/>_movement_ · idx 0 | D | Stepping into a filled bathtub applies a bathing outfit condition, splash effect and makes the tub unmovable. | dynamic selectors (table-driven) |
| `data/scripts/movements/bath_tub.lua`<br/>_movement_ · idx 0 | D | Stepping out reverts the tub id and removes the outfit condition. | dynamic selectors (table-driven) |
| `data/scripts/movements/cake.lua`<br/>_movement_ · idx 0 | D | onAddItem: dropping a candle (2918) on a cake transforms it into a birthday cake with a red effect (add-item trigger, not step-in). | ids 6278 |
| `data/scripts/movements/claw_of_the_noxious_spawn.lua`<br/>_movement_ · idx 0 | E | onEquip outside a PZ deals 150-200 physical damage with a flavour message; missing mechanic: equip events. | ids 9393 |
| `data/scripts/movements/decay_to.lua`<br/>_movement_ · idx 0 | D | Stepping on ice/mud tiles (293/475/1066) transforms them to the cracked variant and starts decay. | ids 293, 475, 1066 |
| `data/scripts/movements/dough.lua`<br/>_movement_ · idx 0 | D | onAddItem: dough dropped on an oven bakes into bread/cake with a fire effect. | ids 2535, 2537, 2539, 2541 |
| `data/scripts/movements/drowning.lua`<br/>_movement_ · idx 0 | D | Step-in on deep water applies the drown condition (and haste variant). | ids 5404, 5405, 5406, 5407, 5408, 5409, 5743, 5764 …(+4) |
| `data/scripts/movements/drowning.lua`<br/>_movement_ · idx 1 | D | Step-out removes the drown/haste conditions. | ids 5404, 5405, 5406, 5407, 5408, 5409, 5743, 5764 …(+4) |
| `data/scripts/movements/snow.lua`<br/>_movement_ · idx 0 | D | Stepping off snow leaves a trampled variant that decays back, plus a Snowbunny achievement. | ids 799, 6580, 6581, 6582, 6583, 6584, 6585, 6586 …(+7) |
| `data/scripts/movements/swimming.lua`<br/>_movement_ · idx 0 | D | Step-in on swimming tiles clears conditions and applies the swimming outfit. | dynamic selectors (table-driven) |
| `data/scripts/movements/swimming.lua`<br/>_movement_ · idx 1 | D | Step-out removes the swimming outfit. | dynamic selectors (table-driven) |
| `data/scripts/movements/yellow_pillow.lua`<br/>_movement_ · idx 0 | F | Stepping on the yellow pillow says "Faaart!" with a puff effect. | ids 2397 |

## Canary startup tables we have not imported

`data-otservbr-global/startup/tables/*.lua` are loaded at boot by `startup.lua` -> `tables/load.lua`, then consumed by `data-otservbr-global/scripts/globalevents/others/map_attributes_loader.lua`, which calls the helpers in `startup/others/functions.lua`:

- `loadLuaMapAction(T)` — stamps `ITEM_ATTRIBUTE_ACTIONID = key` on the item at each listed position (or on the ground/top item when `itemId = false`).
- `loadLuaMapUnique(T)` — stamps `ITEM_ATTRIBUTE_UNIQUEID = key` on the single item at that position.
- `loadLuaMapSign` / `loadLuaMapBookDocument` — stamp `ITEM_ATTRIBUTE_TEXT` (and create the book/scroll if missing).
- `CreateMapItem` — creates items on the map that the OTBM does not contain.
- `updateKeysStorage` — SQL migration of old player storage keys.

| Table file | Global(s) | Action keys / positions | Unique keys / positions | Consumed by |
| --- | --- | ---: | ---: | --- |
| `item.lua` | `ItemAction`, `ItemUnique` | 298 / 900 | 258 / 258 | everything id-keyed: `other/down_floor.lua` (aid 102), `farmine/…vines` (12141-2), `other/teleport_item.lua`, dozens of quest scripts |
| `lever.lua` | `LeverAction`, `LeverUnique` | 35 / 88 | 120 / 120 | quest levers (`data-otservbr-global/scripts/quests/**` — Annihilator, POI, Draconia, Desert Dungeon …) plus dawnport/dark-cathedral levers |
| `tile.lua` | `TileAction`, `TileUnique` | 89 / 561 | 33 / 36 | `movements/others/remove-create_item.lua` (uids 29001-30000), `dawnport_tiles.lua` cure tiles (aid 20001), quest tiles |
| `teleport.lua` | `TeleportAction`, `TeleportUnique` | 15 / 25 | 79 / 129 | `movements/others/teleport.lua` (uids 38001-40000), `teleport/adventurers_guild.lua` (aid 4253), dark cathedral teleports (35021-2) |
| `teleport_item.lua` | `TeleportItemAction`, `TeleportItemUnique` | 20 / 33 | 4 / 8 | `actions/other/teleport_item.lua` (uids 15001-20000) + `lib/tables/teleport_item_destinations.lua` |
| `corpse.lua` | `CorpseAction`, `CorpseUnique` | 4 / 4 | 6 / 6 | quest corpses (mostly placeholder rows; one row is literally `x = xxxxx`) |
| `create_item.lua` | `CreateItemOnMap` | 2 / 7 | — | `CreateMapItem` at startup: the Explorer Society dwarven pickaxe (6 spots) + one Farmine item |
| `writeable.lua` | `BookDocumentTable` | 87 entries / 62 positioned | — | `loadLuaMapBookDocument`: readable books/scrolls/letters, incl. all Dawnport lore books |
| `door_quest.lua` | `QuestDoorAction`, `QuestDoorUnique` | 165 / 269 | — | `data/scripts/actions/doors/quest_door.lua` + `data/scripts/movements/closing_door.lua`; keys are `Storage.Quest.*` constants, so the actionId *is* the storage key |

For comparison, the tables we **have** imported: `chest.lua` (395 keys -> `server/data/chests.json` 344 + `quest-chests.json` 45, 168 skipped), `door_key.lua` (35 / 49 -> `door-keys.json`), `door_level.lua` (12 / 30 -> `door-levels.json`).

Two more that are neither imported nor referenced by any deferred registration: `tile_pick.lua` (`TilePickAction`, 1 key / 16 positions — pickable tiles incl. Battle Axe and Life Ring quest) and `item_unmovable.lua` (placeholder only). `storage_keys_update.lua` is a DB migration table.

**Caveat on the "stamped by" column above:** most quest action/unique ids referenced by deferred scripts are **not** in any startup table — they are baked into the OTBM map itself (e.g. 50011/50012 kazordoon elevator, 1056 bear-room lever, 22006 katana door, 30492 rookgaard chest, 9302-9304 deepling chests, 50390 fibula, 15998/15999 schrodinger). The startup tables only patch ids the map is missing. Anything reading `item.actionid`/`item.uid` therefore needs the OTBM attributes, which our `otservbr.map.json` currently does **not** carry (it exposes only `worldActions` of kinds rope-hole / ladder / rope-spot / dropdown, 8805 entries).

## "Top 10 player-visible quests" — the important correction

**The classic quests are not in the deferred set, because they were never scanned.** The ledger `source.trees` covers only:

```
data/scripts/{actions,movements,creaturescripts}
data-otservbr-global/scripts/{actions,movements,creaturescripts}
```

Canary keeps its quest content in `data-otservbr-global/scripts/quests/` — **978 Lua files across ~130 quest folders** — which is outside every scanned tree. So Annihilator, Pits of Inferno, Desert Dungeon, Draconia, Demon Oak, Demon Helmet, Behemoth, Queen of the Banshees, The Inquisition, Wrath of the Emperor etc. appear in the ledger as **neither implemented nor deferred — they are invisible**. Also unscanned: `scripts/world_changes/`, `scripts/globalevents/`, `scripts/raids/`, `scripts/systems/`, `scripts/spells/`, `scripts/custom/`, `scripts/blue_valley/`.

### 10a. The classic quests, and what is actually missing for each

| Quest | Canary path (unscanned) | What we already have | What is missing |
| --- | --- | --- | --- |
| The Annihilator | `quests/the_annihilator/{lever,door}.lua` | reward chest defs (chest.lua import) | 4-player-on-tiles ritual, level-100 gate, demon spawns, daily storage `U7_24.TheAnnihilator.Reward`, aid-10102 storage door |
| Pits of Inferno | `quests/the_pits_of_inferno_quest/` (19 files) | — | maze levers, drawbridge movements, throne checks, boss globalevents, holy-water/oil item steps |
| Desert Dungeon | `quests/desert_dungeon_quest/actions_desert_dungeon_lever.lua` | — | lever that opens the wall; lever ids come from `startup/tables/lever.lua` |
| Draconia | `quests/draconia/{action-lever,movement-escape,movement-exit_teleport}.lua` | — | lever + escape/exit step-in teleports |
| Orc Fortress | `quests/others/actions_orc_edron_lever.lua` | — | lever-opened wall |
| Demon Oak | `quests/demon_oak/` (7 files) | — | squares movements, area damage, gravestone dialogue, chest, voices globalevent |
| Demon Helmet | `quests/demon_helmet/` | — | multi-lever/door sequence |
| Queen of the Banshees | `quests/the_queen_of_the_banshees/` | all 8 seal storages are in our 51-quest catalog; `door_quest.lua` has the banshee doors | the seal-breaking actions themselves + quest doors |
| The Inquisition | `quests/the_inquisition_quest/` | storages in catalog | boss ritual + doors |
| Behemoth / Great Dragon Hunt | `quests/behemoth/`, `quests/the_great_dragon_hunt_quest/` | chest rewards | levers/doors |

### 10b. Top 10 most player-visible things *inside* the deferred set

| # | Feature | Deferred registrations | Blocker |
| --: | --- | --- | --- |
| 1 | **Dawnport starter island** (the first 20 levels of every new character) | 8 tile registrations + `dawnport/lever.lua` + `vocation_door.lua` + `dawnport_vocation_trial.lua` + `creaturescripts/others/dawnport.lua` | `Storage.Dawnport.*` and `Quest.U10_55.Dawnport.VocationReward` are **not** in our quest catalog; also needs starter-kit granting and the 8s timed bridge re-arm |
| 2 | **Quest doors** (every sealed door in the game) | `data/scripts/actions/doors/quest_door.lua` | per-character storage read keyed by the door actionId + the 165-key / 269-position `door_quest.lua` table + OTBM actionids |
| 3 | **Rookgaard starter quests** — ✅ SHIPPED 2026-08-09 (agents/quest-parity-rookgaard) | 9 registrations | Rapier chest, bear room (aid 30006), katana lever+door, sewer bridge, level/premium bridges live (quest-lever tables + movement gates + chest import; e2e `playtest:rookgaard`). CORRECTION: uid 1056, uids 14049/14050 (goblin temple) and aid 30492 (wooden-sword chest) are **dead content in Canary** at a879c931 — stamped neither in the OTBM nor by any startup table — and are excluded, not implemented |
| 4 | **Teleport network** (Oramond/Rathleton, Vengoth, Ab'Dendriel, Fibula, Port Hope, Gray Beach, Candia, turtles, Dragolisk, Gnomprona, Schrödinger) | ~30 movement registrations + `movements/others/teleport.lua` (uids 38001-40000) | one data-driven step-in teleport table (destination + effect + optional level/premium/storage gate); the data is already in `startup/tables/teleport.lua` |
| 5 | **Use-to-teleport props** (hive gates, sewer grates, elevators, rope-downs, ore wagons, vines, draw wells, boats) | ~25 action registrations | the same table, on the use path — i.e. a `teleport` verb on the new quest-touch system |
| 6 | **Adventurers Guild** (stone + magic door + exit) | 3 registrations | `AdventurersGuild.Stone` / `.MagicDoor` storages (not in catalog) + town temple lookup |
| 7 | **Elemental shrines / Feyrist** | `shrine_entrance.lua`, `shrine_exit.lua`, `feyrist_exit.lua`, `other/gems.lua` | `Storage.ShrineEntrance` round-trip storage, level-30 gate, gem consumption at the shrine |
| 8 | **Roshamuul prison bosses** (golden lever + 3 cell keys) | 2 registrations | boss arena mechanic: N-player check, per-player 20h cooldown, global room-busy flag, boss spawn, timed room clear |
| 9 | **Kazordoon** (ore wagon network, elevators, trapdoor, stone lever) | 5 registrations | `Storage.WagonTicket` weekly timer + teleport-on-use; the stone/trapdoor levers are pure bucket A |
| 10 | **Grimvale were-item enchanting + Deepling boss chests** | `moonlight_crystals.lua`, `deeplings/bosses_reward.lua` | `GrimvaleQuest.WereHelmetEnchant` (missing from catalog) and per-player boss-kill storages |

## Surprising findings

1. **The ledger under-scans Canary by roughly 4x.** 313 registrations vs. 978 Lua files in `scripts/quests/` alone. `counts.deferred = 261` reads like "261 quest scripts left"; it is actually "261 *non-quest* scripts left, and the quest tree was never looked at".
2. **The deferred set is not quest content.** By kind: 152 actions, 62 movements, 47 creature-events — and the biggest single cluster is *food and consumables* (17 identical "eat, buff, 10-min exhaustion" scripts), followed by monster-AI creature events (20).
3. **~55 of 261 registrations are one mechanic: "teleport me somewhere"** (25 on use, 30 on step-in). Adding a `teleport` verb + a destination table to the quest-touch/pressure-plate systems is by far the highest-yield single change in the whole ledger.
4. **`remove-create_item.lua` is quest-touch's movement twin** and is already 100% data-driven in Canary (`TileUnique`, uids 29001-30000): step-in removes an item at a target position, step-out recreates it. Worth importing `tile.lua` in the same pass as the new table.
5. **Most quest ids are in the OTBM, not the startup tables.** Of ~48 aids/uids probed from deferred scripts, only 9 exist in `startup/tables/*.lua`. CORRECTION (verified 2026-08-09): the OTBM attributes DID survive conversion — `server/data/otservbr.content.json` `worldItemAttributes` carries 2,248 actionIds and 587 uniqueIds, loaded via `loadWorldItemSources` and served at runtime through `server/src/action/mapItemAttributes.ts`. Aid/uid-keyed features can ship today for items the map classifies as mutable; the remaining gap is items baked static (see the MUTABLE_POSITIONS override added by agents/quest-touch-actions).
6. **`corpse.lua` ships broken placeholder data** in upstream Canary (`{ x = xxxxx, y = xxxxx, z = xx }` for key 20001) — do not import it blindly.
7. **Three deferred entries duplicate things we already have handlers for**: `tools/sickle.lua` (we have `handleSickleUse.ts`), `other/kits.lua` (`handleDecorationKitUse.ts`), `items/exercise_training_weapons.lua` (`ExerciseTrainingHandler.ts`). The ledger status may be stale for these — worth re-running `tools/buildWorldActionParityInventory.mjs`.
8. **`freequests.lua`** is a config-toggled script that stamps a large table of quest storages onto every character on login. If we ever port it, it doubles as a ready-made list of "which storage value means quest complete" for ~40 quests.

