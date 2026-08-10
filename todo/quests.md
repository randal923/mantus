# Quest content — e2e verification backlog

Rewritten 2026-08-09 after the quest-fix pass (`agents/quest-fixes`) resolved
the original sweep's findings 1–3 and 6 and decided finding 4 per door.
Everything below was verified live against playtest servers (fresh dedicated
databases, real wire protocol, headless clients). Reproduce with:

```
yarn workspace server playtest:quest-chests   # all 388 chests (390 placements) + quest log
yarn workspace server playtest:quest-doors    # all 35 key doors, key sourced from its chest
yarn workspace server playtest:rookgaard      # Rookgaard starter pack (levers, gates, rapier)
yarn workspace server playtest:cultist-key    # chest -> key -> crypt door -> quest touch
yarn workspace server playtest:gate           # gate of expertise level gating
```

## What passes today (2026-08-09)

- **Rookgaard starter pack**, **cultist key chain**, **gate of expertise**:
  PASS end to end.
- **Chests** — 387 of 388 registered chests grant their reward once, land it
  in the inventory (bag-wrapped where Canary wraps), say the exact Canary
  lines, and answer "The … is empty." on re-use (367 direct + 20 correct
  empty halves of shared-`lootedKey` pairs). Chests resolve from the position
  table like quest touches, so baked scenery hosts (dead trees, coffins,
  ground tiles, the two uncataloged hosts 23736/28828) fire without a
  server-owned host item. Charged amulets/necklaces grant as ONE item
  carrying the Canary charge count (`charges` reward attribute), never as a
  multiplied stack of items. The one non-passing chest is 6249, below.
- **Key doors** — every reachable key door opens with its chest-sourced key
  and is walked through: 34 positions unlock by key, and the aid-3301/3302
  doors open by plain use — their stamped key is inert in Canary too (the
  12035 custom door is outside `key_door.lua`'s tables; `custom_door.lua`
  opens it freely). The door sweep runs creature-free (`disableCreatures`),
  because the seeded monster AI otherwise parks the same monster in the same
  doorway every run — that, not the movement pipeline, was the entire
  "opened but impassable" finding (the movement path was exonerated by live
  `MovementRules` execution at all three tiles).

## Open items

### 1. Twelve doors have no obtainable key — decided per door

- **Sealed, parity-accurate** (no key source exists anywhere in Canary
  either; the aids are reserved in `lib/core/storages.lua` and consumed only
  by `door_key.lua`): aids **3001, 3003–3007** (Draconia set) and **808**.
  Nothing to do unless Canary adds a source.
- **Sealed, Canary-broken upstream**: aid **3002** — Canary's own source
  chest (`ChestUnique[6093]`) misses `isKey`, reads a nil `storage =
  keyAction`, and nests `itemPos`, so Canary grants an aid-less key and
  never marks the chest looted. Our importer documents the exclusion
  ("Canary grants nothing either"). Revisit only if Canary fixes it.
- **Waiting on NPC import** — the key is sold/granted in dialogue; needs a
  grant-item dialogue action kind plus these NPCs (only 3 world NPCs exist
  today). Owner: NPC parity / quest-parity buckets C–E:
  - aid **3012** — Elathriel (`npc/elathriel.lua:195-215`): say `key`,
    pay 5000 gp → key 2970. Repeatable, no storage gate.
  - aid **3940** — Dermot (`npc/dermot.lua:68-90`, 2000 gp) or Simon the
    Beggar (`npc/simon_the_beggar.lua:270-293`, 500+200 gp chained topics).
  - aid **3142** — Skjaar (`npc/skjaar.lua:55-87`): 1000 gp + riddle
    answers (`redips`, `7`, `black`) → key 2970.
  - aid **3666** — A Prisoner (`npc/a_prisoner.lua:80-102`): hand over 7
    apples through a four-step `yes` chain, sets the MadMageRoom storage,
    grants key 2969.

### 2. The 51-quest catalog is display-only — zero quests progressable

E2E-confirmed again after this pass: `quest-log-get` returns **0 started
quests** after looting every working chest. Nothing writes quest storage —
no chest carries `storageWrites`, and no NPC dialogue effect writes a quest
storage key (only travel gating does). All 51 quests / 456 missions in
`content/quests/canary-quests.json` render in the quest log UI but can never
start, progress, or complete. The work is the 114 `pending-behavior` Canary
script directories triaged in `todo/quest-parity-triage.md` (buckets C =
storage machines, D = movement triggers, E = new mechanics incl. the ~25
teleport-on-use collapse).

Chest **6249** at (32876,31958,11) is part of this item: its pocket is
gated by the quest-variant door 5104 at (32876,31957,11), which fails
closed ("The door seems to be sealed against unwanted intruders.") until
quest storage ships. The chest sweep reports it `unreachable` because the
sweeper's `/goto` only sees static walkability; the chest itself fires fine
once the door can open. It will heal with the quest-door storage work — no
map or converter change is needed.

## Harness notes shipped with this pass (2026-08-09)

- `questDoorKeySweep.ts` boots the world with `disableCreatures: true`,
  asserts unlocks by the OPEN door id (not merely a covering tile-state),
  reports the wire `position-correction` reason when a step is refused,
  falls back to a plain use when the key is inert (Canary parity for
  custom-door positions), and drops each spent key/reward bag after its
  door — 25+ accumulated grants otherwise overflow the sweeper's top-level
  slots and hide later keys inside the bag.
- `questChestSweep.ts` checks the reward against the carried summary
  (`inventory.carried`) as well as top-level slots: once slots fill
  mid-window, grants legally land inside the starter bag, which only the
  carried summary can see without opening containers.
