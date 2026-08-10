# Quest content — e2e verification backlog

Written 2026-08-09 from a full end-to-end sweep of every piece of quest
content in the game. Everything below was verified live against a playtest
server (fresh dedicated databases, real wire protocol, headless clients), not
by reading data files. Reproduce with:

```
yarn workspace server playtest:quest-chests   # all 390 placed chests + quest log
yarn workspace server playtest:quest-doors    # all 35 key doors, key sourced from its chest
yarn workspace server playtest:rookgaard      # Rookgaard starter pack (levers, gates, rapier)
yarn workspace server playtest:cultist-key    # chest -> key -> crypt door -> quest touch
yarn workspace server playtest:gate           # gate of expertise level gating
```

## What passes today

- **Rookgaard starter pack** — rapier chest, bear-room lever, katana lever +
  door, sewer drawbridge, level bridge, premium bridge: PASS end to end.
- **Cultist key chain** — Carlin box → bone key → crypt door → Cults of
  Tibia torch → decaying wall: PASS end to end.
- **Gate of expertise** — level refusal + level-65 open + walk-through: PASS.
- **Chests** — of the 388 registered chests (390 placements), 328 grant
  their reward once, land it in the inventory (bag-wrapped where Canary
  wraps), say the exact Canary lines, and answer "The … is empty." on
  re-use; 18 more are the correct empty half of a shared-`lootedKey` pair
  (e.g. 3084/3085). The remaining 42 findings are the dead placements (1.)
  and the charge-count import bug (2.) below.
- **Key doors** — 25 door positions unlock with the matching chest-sourced
  key (including keys granted inside reward bags) and 20 of 23 tested doors
  are walkable after opening.

## Broken — needs fixing

### 1. 30 chest placements are dead content (host item never became a world item)

`use-map` on these positions does nothing at all — no message, no error, no
loot. Root cause (verified against `otservbr.items.bin`): the chest tables
register on scenery hosts (dead trees, coffins, small holes, palms, ground
tiles, statues, corpses), but the map converter either left the host baked
draw-only (no items.bin entry) or classified it 2 = interactive scenery,
and `loadMapItems.getItems` only surfaces classification 1, so
`resolveWorldAction` never sees a host item to fire the chest.

| chest | host item | position | items.bin state |
| --- | --- | --- | --- |
| 5000 | 387 small hole | (32219,32401,10) | absent |
| 5001 | 1777 stone | (32652,32107,7) | absent |
| 5006 | 3634 dead tree | (32800,31959,7) | absent |
| 5007 | 3634 dead tree | (32813,31964,7) | absent |
| 5011 | 3634 dead tree | (32497,31887,7) | absent |
| 5016 | 3204 dead human | (32576,32216,15) | absent |
| 5017 | 387 small hole | (32589,32100,14) | absent |
| 5019 | 3634 dead tree | (32617,32250,7) | absent |
| 5020 | 3634 dead tree | (32609,32244,7) | absent |
| 5021 | 3634 dead tree | (32651,32244,7) | absent |
| 6016 | 3639 palm | (32172,32169,7) | absent |
| 6017 | 3639 palm | (31983,32193,5) | absent |
| 6047 | 3634 dead tree | (32868,31955,11) | absent |
| 6048 | 3634 dead tree | (32880,31955,11) | absent |
| 6055 | 2476 wooden coffin | (32248,31866,8) | absent |
| 6076 | 2474 wooden coffin | (33063,31624,15) | absent |
| 6111 | 3634 dead tree | (32769,31968,7) | absent |
| 6155 | 2476 wooden coffin | (32775,32006,11) | absent |
| 6156 | 387 small hole | (32371,32262,12) | absent |
| 6173 | 2474 wooden coffin | (33327,32182,7) | absent |
| 6181 | 408 wooden floor | (32084,32181,8) | absent |
| 6182 | 9226 honey flower | (32005,32139,3) | absent |
| 6236 | 408 wooden floor | (33194,32458,7) | classification 2 |
| 6238 | 231 sand | (33212,32593,7) | classification 2 |
| 6249 | 3634 dead tree | (32876,31958,11) | classification 2 |
| 6290 | 1895 debris | (33327,31410,8) | absent |
| 6310 | 23736 (not in catalog) | (32825,31664,9) | classification 2 |
| 6320 | 27490 unknown corpse | (32836,32820,10) | classification 2 |
| 6324 | 9794 dragon statue | (32890,32768,9) | classification 2 |
| 6326 | 28828 (not in catalog) | (32013,32447,8) | classification 2 |

Fix: add these 30 placements to `MUTABLE_POSITIONS` in
`tools/getMapItemSemantics.mjs` (position-scoped — the host types are far
too common for `MUTABLE_ITEM_IDS`; a dead tree exists all over the map),
rerun `map:convert`, reconcile the world seed, and rerun
`playtest:quest-chests` until it reports 0 findings. Two hosts (23736,
28828) are also missing from the item catalog (same zero-first-sprite
builder gap as the torch bearers, see TODO.md). This is a *different* list
from the 22 non-mutable aid-2000/2001 instances already recorded in TODO.md
(those were skipped at build time and live in `quest-chests.json`'s
`skipped`; these 30 shipped in the active tables and silently never fire).

Knock-on effect: **10 key doors are uncompletable** because their key chest
is in this list — aids 3610 (chest 5017), 3667 (5016), 3899 (5011),
3980 (5000), 4055 (5001), 5010 (5006), 6010 (6076), 3301 (5019),
3302 (5020), 3303 (5021). They should heal automatically once the chests
fire; re-verify with `playtest:quest-doors`.

### 2. Charged-amulet rewards imported as item counts — 12 chests unlootable, 2 grant multiplied items

Fourteen chest rewards are non-stackable charged amulets/necklaces whose
Canary *charge* count was imported as an item *count*. The store needs one
slot per non-stackable item, so a "silver amulet ×200" reward can never be
placed — the chest always answers "You have found a silver amulet, but you
have no room to take it." and stays unlooted (the gate is not claimed, so
this is at least retryable after a fix):

- unlootable: 6034 (3054 ×200), 6039 (3083 ×150), 6043 (3085 ×200),
  6051 (3082 ×50), 6067 (3085 ×200 in bag), 6131 (3085 ×200 in bag),
  6136 (3083 ×150), 6152 (3056 ×200), 6154 (3054 ×200),
  6158 (3084 ×250 in bag), 6160 (3083 ×150 in bag), 6174 (3084 ×250)
- silently wrong instead of failing: 6024 and 6082 (stone skin amulet ×5)
  fit in the slots and grant **five separate amulets** where Canary grants
  one amulet with 5 charges — an economy-relevant multiplication.

Fix: teach the chest importer (`tools/importCanaryChests.mjs`) to emit
non-stackable charged rewards as count 1 with a `charges` attribute (the
reward `attributes` path already exists for `actionId`/`text`), regenerate
the data, and re-verify with `playtest:quest-chests`.

### 3. Three key doors open but stay impassable

The matching key transforms the door to its open type (verified in
tile-states), but stepping onto the opened door tile is refused — across
runs, deterministically — while the same walk-through passes on 20 other
doors:

- aid 4603 → door 5106→5108 at (32179,32149,10)
- aid 909 → door 5115→5117 at (33368,31331,7)
- aid 3600 → door 5106→5108 at (32506,32175,14)

Eliminated so far: static walkability is identically `false` on passing
doors (the dynamic override is what opens the tile, and
`doorPassabilityForItemId` returns true for `role === "open"` regardless of
type); catalog entries are byte-identical to passing door types apart from
ids/sprites; the tiles are not house tiles; no `door-levels.json`
requirement exists at these positions; exactly one server-owned item (the
door, classification 1) sits on each tile. Next step: live-debug
`MovementRules`/`overrideMapData` at one of these tiles to see which gate
refuses the step.

### 4. Twelve key doors have no obtainable key

No chest in `chests.json`/`quest-chests.json` rewards a key with these
ActionIds, so the doors can never be opened by a player: aids 3001–3007,
3012 (Thais jail block), 3610*, 3666, 3940, 808, 3142. In Canary these keys
come from NPCs, monster loot, or quest scripts that are not imported yet
(quest-parity-triage buckets C/E). Decide per door whether to import the
Canary source or accept the door as sealed. (*3610 additionally has its
chest dead, see 1.)

### 5. The 51-quest catalog is display-only — zero quests progressable

E2E-confirmed: after looting every working chest in the game, `quest-log-get`
still returns **0 started quests**. Nothing in the game writes quest storage
today — no chest carries `storageWrites` (both data files: zero entries),
and no NPC dialogue effect writes a quest storage key (only travel gating
does). All 51 quests / 456 missions in `content/quests/canary-quests.json`
render in the quest log UI but can never start, progress, or complete. The
work to make them progressable is the 114 `pending-behavior` Canary script
directories, triaged in `todo/quest-parity-triage.md` (buckets C =
storage machines, D = movement triggers, E = new mechanics incl. the ~25
teleport-on-use collapse).

### 6. Chest 6249 unreachable on top of being dead

`/goto` finds no walkable tile within use-reach of (32876,31958,11) — the
dead tree sits fully enclosed. When fixing the classification (1.), also
check the surrounding tiles; Canary players reach it, so either a
transition or removable obstacle is missing nearby.

## Scenario reliability fixes shipped with this sweep (2026-08-09)

- `cultistKeyChest.ts` used a fixed dev token; after a few runs the account's
  character slots filled and login failed. Now mints a per-run token.
- `gateOfExpertise.ts` sent its second `use-map` inside the 200 ms use
  exhaust (an exhausted use-map silently degrades to a walk-click — by
  design), and reused a persistent character/world so the level-1 refusal
  leg broke on every rerun. Now waits out the exhaust and runs on a
  dropped-fresh `playtest_gate` database.
- Both sweeps run on dropped-fresh databases (`playtest_quest_sweep`,
  `playtest_quest_doors`) so door/lever world rows and looted flags can
  never leak between runs.
