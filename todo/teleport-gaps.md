# Map teleports that still do nothing

Produced by the 2026-08-11 teleport audit (see `done.md`): every
teleport-type item placement in `map/otservbr.otbm` (2,438 tiles) joined
against Canary `a879c931` — `startup/tables/teleport.lua`,
`teleport_item.lua` and all 366 `MoveEvent` scripts. What ships is 788
static map transitions, 77 `QUEST_TELEPORTS` rows, the 2 Adventurers Guild
exit portals and the 65 elemental shrine flames. Everything below is a tile
a player can stand on where Canary teleports them and we do not.

Coordinates are the portal tile (`x,y,z`); the nearest town is a locator,
not a claim about which town owns the content. **Gate** is why the portal
is not simply a `QUEST_TELEPORTS` row:

- `storage` — needs per-character quest storage the quest itself never sets here.
- `boss` — needs the boss cooldown / arena bookkeeping (`canFightBoss`, KV state).
- `level` — level requirement only; the cheapest group to close.
- `world-state` — reads live map or inventory state (levers, sacrifices, a live boss, an equipped helmet).

Adding any of these as an unconditional row would hand players a free ride
into boss rooms and quest interiors, so they wait for the owning system.

## Citizenship flames (17 tiles, one per city)

Blocked on a persistence change, not a quest system: `Player.townId` is
`readonly`, and neither `CharacterPersistence`'s save snapshot nor the
`PgCharacterStore` UPDATE carries `town_id`. Canary's
`movements/teleport/citizen.lua` sets the player's town and teleports them
to that town's temple; Svargrond additionally demands the Barbarian Test
storage, which should fail closed to "temple, no citizenship".

| City | Portal tile |
| --- | --- |
| Ab'Dendriel | `32607,31682,7` |
| Ankrahmun | `33195,32849,6` |
| Carlin | `32360,31784,8` |
| Darashia | `33216,32455,2` |
| Edron | `33210,31804,8` |
| Farmine | `33008,31493,11` |
| Gray Beach | `33447,31327,9` |
| Issavi | `33926,31477,5` |
| Kazordoon | `32642,31925,12` |
| Liberty Bay | `32313,32818,7` |
| Port Hope | `32595,32749,6` |
| Rathleton | `33587,31899,6` |
| Roshamuul | `33513,32364,7` |
| Svargrond | `32214,31133,5` |
| Thais | `32369,32246,6` |
| Venore | `32951,32035,7` |
| Yalahar | `32785,31277,7` |
| Svargrond roof (aid 30032, `citizen_svargrond.lua`) | `32208,31134,7` |

## Quest, boss and level-gated portals (366 tiles)

### quests/killing_in_the_name_of/movements_boss — 35 tiles · gate: `boss+storage` · Svargrond ~347

  `31926,31071,10`  `31978,32853,1`  `32003,31189,10`  `32044,32547,14`  `32072,31283,10`  `32085,32782,12`  `32104,31116,2`  `32122,31188,4`  `32141,31144,3`  `32450,31988,9`  `32608,32714,8`  `32679,31114,3`  `32722,32762,8`  `32758,31245,9`  `32769,32290,10`  `32799,32501,11`  `32814,32280,8`  `32815,31119,3`  `32816,31026,7`  `32822,32693,8`  `32842,32660,11`  `32870,31112,4`  `32877,32583,7`  `32920,32883,8`  `32992,31443,7`  `33044,32794,11`  `33046,32439,11`  `33066,31104,2`  `33095,31075,12`  `33109,32803,13`  `33115,31004,8`  `33136,31186,8`  `33251,31719,14`  `33286,31112,8`  `33310,31183,7`

### quests/the_inquisition_quest/movements_teleport_main — 31 tiles · gate: `storage` · Edron ~241

  `33038,31752,15`  `33065,31771,10`  `33068,31782,13`  `33093,31574,11`  `33104,31735,11`  `33110,31681,12`  `33123,31692,11`  `33137,31671,11`  `33152,31782,12`  `33157,31728,11`  `33165,31719,14`  `33168,31755,13`  `33169,31705,14`  `33170,31719,14`  `33175,31709,14`  `33175,31713,14`  `33187,31759,15`  `33197,31704,11`  `33197,31768,11`  `33199,31687,12`  `33225,31607,9`  `33230,31633,12`  `33232,31734,11`  `33234,31758,12`  `33249,31632,13`  `33260,31750,13`  `33339,31632,13`  `33355,31589,11`  `33357,31588,12`  `33365,31613,11`  `33372,31614,14`

### quests/heart_of_destruction/movements_teleport_heart — 28 tiles · gate: `boss+storage` · Svargrond ~310

  `32089,31319,13`  `32106,31329,12`  `32113,31366,14`  `32148,31299,14`  `32148,31356,14`  `32148,31356,15`  `32162,31327,11`  `32179,31238,14`  `32199,31248,14`  `32200,31285,14`  `32207,31370,14`  `32213,31369,14`  `32213,31378,14`  `32221,31327,14`  `32221,31373,14`  `32225,31285,14`  `32232,31359,11`  `32244,31254,14`  `32254,31372,14`  `32261,31250,14`  `32271,31386,14`  `32281,31316,14`  `32281,31348,14`  `32289,31372,14`  `32303,31247,14`  `32318,31284,14`  `32326,31250,14`  `32341,31289,14`

### quests/bigfoot_burden/movements_gnomebase_teleport — 24 tiles · gate: `storage` · Svargrond ~67

  `32196,31183,8`  `32330,32173,9`  `32403,32818,6`  `32628,31863,11`  `32772,31776,9`  `32772,31799,10`  `32786,31754,9`  `32789,31796,10`  `32795,31761,10`  `32796,31780,10`  `32803,31745,10`  `32803,31798,9`  `32805,31743,9`  `32827,31757,9`  `32831,31797,9`  `32864,31845,11`  `32904,31893,13`  `32959,31952,9`  `32980,31907,9`  `32986,31861,9`  `33000,31871,13`  `33001,31916,9`  `33154,31834,10`  `33187,32384,8`

### world_changes/nightmare_isles — 17 tiles · gate: `storage` · Cobra Bastion ~45

  `33416,32625,10`  `33419,32588,10`  `33419,32602,10`  `33420,32582,9`  `33420,32602,10`  `33429,32633,8`  `33430,32599,10`  `33434,32631,8`  `33453,32628,8`  `33456,32579,8`  `33462,32585,8`  `33465,32636,10`  `33472,32645,9`  `33473,32645,9`  `33474,32641,10`  `33478,32622,11`  `33483,32628,8`

### quests/wrath_of_the_emperor/movements_teleports_access — 14 tiles · gate: `boss+storage` · Yalahar ~411

  `33072,31150,15`  `33076,31218,8`  `33076,31219,8`  `33084,31213,8`  `33092,31122,12`  `33111,31123,12`  `33136,31248,6`  `33136,31249,6`  `33211,31067,9`  `33216,31067,9`  `33240,31249,10`  `33359,31395,9`  `33360,31395,9`  `33365,31415,10`

### quests/forgotten_knowledge/movements_entrance_teleport — 12 tiles · gate: `storage` · Svargrond ~103

  `32205,31036,10`  `32325,32087,7`  `32328,32087,7`  `32331,32087,7`  `32334,32087,7`  `32337,32087,7`  `32340,32087,7`  `32637,32255,7`  `32780,32684,14`  `32786,32818,13`  `32805,31657,8`  `33341,31167,7`

### quests/svargrond_arena/movements_arena_pit — 10 tiles · gate: `storage` · Svargrond ~73

  `32167,31104,7`  `32174,31090,7`  `32181,31076,7`  `32181,31104,7`  `32188,31062,7`  `32188,31090,7`  `32195,31076,7`  `32195,31104,7`  `32202,31090,7`  `32209,31104,7`

### quests/dreamers_challenge_quest/movement_tower — 9 tiles · gate: `storage` · Venore ~410

  `32815,32344,4`  `32815,32344,5`  `32815,32344,6`  `32818,32347,5`  `32818,32347,6`  `32819,32347,4`  `32822,32344,4`  `32822,32344,5`  `32822,32344,6`

### quests/the_ancient_tombs/movements_step_morguthis_blue_flames — 8 tiles · gate: `storage` · Cobra Bastion ~187

  `33245,32686,15`  `33252,32703,15`  `33263,32668,13`  `33263,32681,14`  `33269,32698,14`  `33270,32667,15`  `33275,32685,14`  `33279,32682,14`

### movements/teleport/turtles — 7 tiles · gate: `storage` · Liberty Bay ~116

  `32359,32900,7`  `32415,32915,7`  `32440,32970,7`  `32472,32868,7`  `32490,32978,7`  `32523,32922,7`  `32527,32950,7`

### quests/ferumbras_ascension/movements_seal — 7 tiles · gate: `boss+storage` · Farmine ~258

  `33199,31439,13`  `33324,31372,14`  `33402,32406,15`  `33432,32332,14`  `33482,32775,12`  `33662,32682,10`  `33677,32689,13`

### quests/grimvale/actions_portal_minis_grimvale — 7 tiles · gate: `boss` · Edron ~258

  `33055,31910,9`  `33128,31971,9`  `33167,31977,8`  `33395,32111,9`  `33402,32097,9`  `33442,32051,9`  `33446,32040,9`

### movements/teleport/gnomprona — 6 tiles · gate: `boss+storage` · Gnomprona ~143

  `33558,32754,14`  `33567,32758,15`  `33658,32919,15`  `33660,32895,14`  `33671,32933,15`  `33714,32797,14`

### quests/cults_of_tibia/movements_boss_timer — 6 tiles · gate: `boss` · Edron ~202

  `33072,31871,15`  `33096,31963,15`  `33114,31887,15`  `33125,31950,15`  `33176,31894,15`  `33178,31845,15`

### quests/feaster_of_souls/actions_entrances — 6 tiles · gate: `level` · Rookgaard ~320

  `31904,32346,9`  `33572,31459,8`  `33581,31465,9`  `33601,31441,10`  `33863,31854,9`  `33886,31784,8`

### quests/feaster_of_souls/actions_portal_minis_feaster — 6 tiles · gate: `boss+level` · Gray Beach ~93

  `33467,31396,8`  `33491,31398,8`  `33505,31485,9`  `33509,31450,9`  `33562,31492,8`  `33566,31475,8`

### quests/forgotten_knowledge/movements_challenger — 6 tiles · gate: `boss+storage` · Liberty Bay ~317

  `32033,32859,14`  `32316,31093,14`  `32676,32888,14`  `32849,32689,15`  `32915,31637,14`  `33408,31171,10`

### quests/soul_war/moveevent-soul_war_entrances — 6 tiles · gate: `boss+level` · Gray Beach ~267

  `33615,31422,10`  `33618,31422,10`  `33621,31422,10`  `33624,31422,10`  `33627,31422,10`  `34022,31091,11`

### quests/the_ancient_tombs/movements_tomb_teleport — 6 tiles · gate: `boss` · Ankrahmun ~193

  `33073,32781,14`  `33116,32656,15`  `33174,32694,14`  `33191,32959,15`  `33195,33002,14`  `33396,32852,14`

### quests/the_secret_library_quest/bursting_at_the_seams_museum/movements_teleportTo — 6 tiles · gate: `storage` · Candia ~71

  `33286,32106,9`  `33286,32107,9`  `33287,32106,9`  `33287,32107,9`  `33288,32106,9`  `33288,32107,9`

### quests/elemental_spheres/movements_soil_entrance — 4 tiles · gate: `level` · Edron ~66

  `33262,31835,10`  `33265,31830,10`  `33268,31841,10`  `33274,31835,10`

### quests/elemental_spheres/movements_soil_exit — 4 tiles · gate: `storage` · Venore ~146

  `33085,32094,13`  `33180,32197,13`  `33262,32202,13`  `33329,32074,13`

### quests/wrath_of_the_emperor/movements_boss_teleport — 4 tiles · gate: `boss+storage` · Yalahar ~458

  `33052,31083,14`  `33059,31122,14`  `33098,31083,14`  `33101,31118,14`

### movements/teleport/deeper_banuta_shortcut_teleport — 3 tiles · gate: `storage` · Port Hope ~342

  `32858,32667,8`  `32888,32632,11`  `32890,32632,11`

### quests/bigfoot_burden/movements_warzone_teleport — 3 tiles · gate: `storage` · Venore ~252

  `33013,31880,9`  `33019,31886,9`  `33022,31902,9`

### quests/dangerous_depth/movements_warzone_entrance — 3 tiles · gate: `storage` · Feyrist ~316

  `33777,32192,14`  `33827,32172,14`  `33829,32128,14`

### quests/formogar_mine_hoist/movements_hoist — 3 tiles · gate: `storage` · Svargrond ~61

  `32157,31126,9`  `32157,31126,10`  `32157,31126,11`

### quests/hero_of_rathleton/movements_fast_way — 3 tiles · gate: `storage` · Rathleton ~151

  `33714,31930,14`  `33716,31930,14`  `33718,31930,14`

### quests/kilmaresh_quest/actions_portal_minis_kilmaresh — 3 tiles · gate: `boss+level` · Krailos ~270

  `33819,31773,10`  `33883,31467,9`  `33886,31477,6`

### quests/svargrond_arena/movements_arena_enter — 3 tiles · gate: `storage` · Svargrond ~57

  `32238,31101,7`  `32241,31101,7`  `32246,31097,7`

### movements/teleport/yalahar_demon — 2 tiles · gate: `world-state` · Yalahar ~289

  `32856,31056,9`  `32893,31046,9`

### quests/adventures_of_galthen/actions_yselda_entrances — 2 tiles · gate: `level` · Bounac ~72

  `32405,32498,10`  `32424,32500,10`

### quests/children_of_the_revolution/movements_teleport — 2 tiles · gate: `storage` · Gray Beach ~433

  `33261,31076,8`  `33356,31124,7`

### quests/dreamers_challenge_quest/movement_sacrifice_teleport — 2 tiles · gate: `storage` · Venore ~320

  `32788,32227,14`  `32840,32226,14`

### quests/ferumbras_ascension/movements_entrance — 2 tiles · gate: `level+storage` · Darashia ~128

  `33275,32388,8`  `33317,32315,13`

### quests/ferumbras_ascension/movements_habitats_access — 2 tiles · gate: `storage` · Cobra Bastion ~262

  `33629,32621,11`  `33666,32624,11`

### quests/ferumbras_ascension/movements_zamulosh_teleport — 2 tiles · gate: `storage` · Moonfall ~184

  `33629,32739,12`  `33637,32650,12`

### quests/in_service_of_yalahar/movements_last_fight_teleport — 2 tiles · gate: `storage` · Yalahar ~105

  `32783,31175,10`  `32784,31177,9`

### quests/liquid_black/movements_shortcut — 2 tiles · gate: `storage` · Gray Beach ~49

  `33439,31282,14`  `33453,31282,14`

### quests/the_ape_city/movements_mission9_the_deepest_catacomb_teleport — 2 tiles · gate: `storage` · Darashia ~453

  `32839,32533,9`  `32854,32544,10`

### quests/the_first_dragon/movements_entrance_teleport — 2 tiles · gate: `boss+storage` · Dawnport ~137

  `32176,31869,15`  `32177,31869,15`

### quests/the_gravedigger_of_drefia/movements_dormitory_teleport — 2 tiles · gate: `storage` · Darashia ~211

  `33015,32441,10`  `33018,32438,10`

### quests/the_gravedigger_of_drefia/movements_sacrifice_teleport — 2 tiles · gate: `storage` · Darashia ~229

  `33015,32423,11`  `33020,32419,11`

### quests/the_gravedigger_of_drefia/movements_teleport — 2 tiles · gate: `storage` · Darashia ~281

  `32988,32398,9`  `33022,32337,10`

### quests/the_hidden_city_of_beregar/moviments_elevator — 2 tiles · gate: `storage` · Ab'Dendriel ~258

  `32611,31497,14`  `32611,31497,15`

### quests/the_secret_library_quest/high_and_dry_isles/movements_stepIn — 2 tiles · gate: `storage` · Dawnport ~215

  `32119,31734,7`  `32460,32928,7`

### movements/oramond/seacrest — 1 tile · gate: `world-state` · Rathleton ~89

  `33545,31859,7`

### movements/teleport/citizen_svargrond — 1 tile · gate: `storage` · Svargrond

  `32208,31134,7`

### movements/teleport/schrodingers_island_teleport_lvl_999 — 1 tile · gate: `level` · Darashia ~402

  `32883,32526,11`

### quests/bigfoot_burden/movements_task_endurance — 1 tile · gate: `storage` · Ab'Dendriel ~207

  `32760,31813,10`

### quests/bigfoot_burden/movements_warzone_boss — 1 tile · gate: `boss` · Venore ~241

  `33100,31978,11`

### quests/chayenne_realm/movements_enter_realm — 1 tile · gate: `level` · Darashia ~274

  `33079,32594,3`

### quests/cults_of_tibia/movements_river_teleport — 1 tile · gate: `boss+storage` · Feyrist ~77

  `33459,32267,10`

### quests/dawnport/movements_legion_helmet — 1 tile · gate: `storage` · Dawnport Tutorial ~78

  `32112,31936,8`

### quests/draconia/movement-escape — 1 tile · gate: `storage` · Ab'Dendriel ~118

  `32815,31599,9`

### quests/draconia/movement-exit_teleport — 1 tile · gate: `world-state` · Ab'Dendriel ~120

  `32805,31587,1`

### quests/dreamers_challenge_quest/movement_riddle_teleport — 1 tile · gate: `world-state` · Venore ~402

  `32826,32347,9`

### quests/dreamers_challenge_quest/movement_stone_teleport — 1 tile · gate: `world-state` · Venore ~257

  `32920,32296,13`

### quests/dreamers_challenge_quest/movement_wall_teleport — 1 tile · gate: `world-state` · Venore ~409

  `32762,32290,14`

### quests/feaster_of_souls/actions_portal_brain_head — 1 tile · gate: `boss+level` · Rookgaard ~266

  `31946,32334,10`

### quests/ferumbras_ascension/movements_plagirath_access — 1 tile · gate: `storage` · Farmine ~274

  `33201,31425,11`

### quests/ferumbras_ascension/movements_razzagorn_access — 1 tile · gate: `storage` · Darashia ~188

  `33395,32460,13`

### quests/forgotten_knowledge/movements_lava_teleport — 1 tile · gate: `storage` · Gray Beach ~245

  `33396,31129,9`

### quests/grave_danger_quest/movements_zelos_tp — 1 tile · gate: `world-state` · Gray Beach ~213

  `33443,31532,13`

### quests/hero_of_rathleton/movements_deep_terror — 1 tile · gate: `storage` · Rathleton ~186

  `33726,31953,14`

### quests/hero_of_rathleton/movements_glooth_horror — 1 tile · gate: `storage` · Rathleton ~74

  `33570,31949,15`

### quests/hero_of_rathleton/movements_lava — 1 tile · gate: `storage` · Candia ~201

  `33369,31955,15`

### quests/hero_of_rathleton/movements_professor_maxxen — 1 tile · gate: `storage` · Rathleton ~229

  `33662,32060,15`

### quests/hidden_threats/movement-cave_spider_room — 1 tile · gate: `boss+storage` · Venore ~109

  `33039,32103,12`

### quests/lions_rock/movements_lions_rock — 1 tile · gate: `storage` · Darashia ~231

  `33128,32308,8`

### quests/liquid_black/movements_quick_access — 1 tile · gate: `storage` · Gray Beach ~42

  `33478,31312,7`

### quests/soul_war/moveevent-teleport_entrance_reward — 1 tile · gate: `world-state` · Gray Beach ~267

  `33621,31416,10`

### quests/the_ancient_tombs/movements_enter_ashmunrah_teleport_switche_done — 1 tile · gate: `storage` · Ankrahmun ~52

  `33179,32890,11`

### quests/the_ancient_tombs/movements_enter_diprath_teleport_switche_done — 1 tile · gate: `storage` · Darashia ~245

  `33083,32569,13`

### quests/the_ancient_tombs/movements_enter_thalas_teleport_switches_done — 1 tile · gate: `storage` · Cobra Bastion ~155

  `33393,32802,14`

### quests/the_first_dragon/movements_last_teleport — 1 tile · gate: `storage` · Gray Beach ~477

  `33597,30996,14`

### quests/the_hidden_city_of_beregar/moviments_pythius_boss_teleport — 1 tile · gate: `boss+storage` · Yalahar ~357

  `32560,31406,15`

### quests/the_hidden_city_of_beregar/moviments_pythius_teleport — 1 tile · gate: `storage` · Yalahar ~315

  `32598,31402,15`

### quests/the_hunt_for_the_sea_serpent/movements_teleports — 1 tile · gate: `storage` · Svargrond ~355

  `31943,31046,7`

### quests/the_inquisition_quest/movements_entrance — 1 tile · gate: `level+storage` · Edron ~148

  `33192,31691,14`

### quests/the_new_frontier/movement_jail_exit — 1 tile · gate: `storage` · Gray Beach ~380

  `33163,31227,11`

### quests/the_new_frontier/movement_minotaur_boss — 1 tile · gate: `boss+storage` · Farmine ~231

  `33146,31413,6`

### quests/the_pits_of_inferno_quest/movements_pumin_teleport — 1 tile · gate: `storage` · Thais ~386

  `32732,32264,15`

### quests/the_queen_of_the_banshees/movement-1-first_seal_flame — 1 tile · gate: `storage` · Carlin ~203

  `32278,31903,13`

### quests/the_queen_of_the_banshees/movement-2-second_seal_flame — 1 tile · gate: `storage` · Dawnport ~148

  `32171,31853,15`

### quests/the_queen_of_the_banshees/movement-3-third_seal_flame — 1 tile · gate: `storage` · Dawnport ~196

  `32215,31849,15`

### quests/the_queen_of_the_banshees/movement-4-fourth_seal_flame — 1 tile · gate: `storage` · Dawnport ~188

  `32250,31892,14`

### quests/the_queen_of_the_banshees/movement-5-fifth_seal_flame — 1 tile · gate: `storage` · Dawnport Tutorial ~160

  `32192,31938,14`

### quests/the_queen_of_the_banshees/movement-6-sixth_seal_flame — 1 tile · gate: `storage` · Carlin ~245

  `32311,31978,13`

### quests/the_shattered_isles_quest/movement_teleport — 1 tile · gate: `world-state` · Rookgaard ~559

  `31919,32600,10`

## Use-activated teleports (4)

Canary `TeleportItemUnique` 15001-15004 (`actions/other/teleport_item.lua`)
fires on *use*, not on a step, so these belong on the world-action/quest-touch
`use` seam rather than in `QUEST_TELEPORTS`.

| Item | Tile | Destination |
| --- | --- | --- |
| 31673 | `33315,32647,6` | `33384,32627,7` |
| 1759 | `33383,32626,7` | `33314,32647,6` |
| 5679 | `33918,31471,7` | `33916,31466,8` |
| 29954 | `33619,32518,15` | `33640,32561,13` |

## Swim-only water vortices (5)

The Trapwood water-elemental cave (`TeleportUnique` 39001, 39002, 39004,
39005, 39006) sits on shallow-water tiles; we have no swimming, so no one can
stand on them. The one dry sibling (39003, `32649,32985,8`) already ships.

| uid | Tile | Destination |
| --- | --- | --- |
| 39001 | `32600,33009,8` | `32600,33009,9` |
| 39002 | `32628,33001,9` | `32624,33001,9` |
| 39004 | `32654,32985,9` | `32651,32983,8` |
| 39005 | `32610,32977,8` | `32612,32980,9` |
| 39006 | `32610,32979,9` | `32608,32978,8` |

## Correctly dead — do not re-audit

Canary's `Teleport::addThing` skips destination `(0,0,0)` and any
destination whose tile does not exist, so these are inert upstream too:

- **11 portals aimed off the map** (old-Tibia or mapper-scratch coordinates):
  `17066,16897,7` `17068,16897,7` `17070,16897,7` `17072,16897,7`
  `30880,32520,8` `30948,32592,8` `33708,32375,15` `33733,32359,15`
  `33744,31065,8` `33966,32129,8` `33979,32055,8`.
- **3 portals on tiles nothing can stand on**: `33082,31045,6` (aimed at
  garbage `195,61836,7`), `32582,31399,8`, `32615,32506,12`.
- **16 placements on tiles with no ground at all** (converter
  `transitionExemptions`), including the 3x3 forcefield block at
  `32295-32297,32259-32261,15` and the mapper's test island near `4990,4996,7`.

## Unattributed zero-destination placements (1140)

Teleport-type items with destination `(0,0,0)` that no Canary script we
could find registers by position, action id, unique id or item id. Most are
scenery that merely shares an item type with a real portal (small boats and
wooden floors are `type="teleport"` in Canary's items.xml), and all of them
are inert in Canary as well — but the magic-forcefield rows deserve a second
pass, since a handler our index could not attribute is the likelier answer.

| Item type on the tile | Placements |
| --- | ---: |
| small boat | 431 |
| magic forcefield | 258 |
| carved stone tile | 100 |
| wooden floor | 63 |
| water vortex | 57 |
| mystic flame | 49 |
| ruined stairs | 37 |
| strange machine | 32 |
| large crystal teleporter | 27 |
| magic portal | 22 |
| energy portal | 19 |
| fog portal | 16 |
| hot geyser | 12 |
| vortex | 7 |
| turtle | 4 |
| portal | 2 |
| fire portal | 2 |
| holy portal | 1 |
| earth portal | 1 |
