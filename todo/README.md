# Playable-world backlog overview

Audit completed 2026-07-14 against the current repository and these pinned
upstream snapshots:

- [Canary `a879c931`](https://github.com/opentibiabr/canary/tree/a879c9312e34381e8eedf397b8ed44510698b689)
  (server mechanics and OTServBR Global content).
- [OpenTibiaBR OTClient `bdea0b23`](https://github.com/opentibiabr/otclient/tree/bdea0b23b4a738809d698cb7e4f88a299dd6bffc)
  (rendering and client behavior; MIT).

This is an implementation backlog, not a promise to reproduce every modern
Tibia feature immediately. `AGENTS.md` and the project security charter are
mandatory for every feature below.

## Rewrite boundary

This project is a complete rewrite of the Tibia stack. Canary and OTClient are
reference implementations only: inspect them to understand behavior, formulas,
data layouts, content locations, edge cases, and proven system boundaries, then
translate and refactor the useful parts into this project's use case.

- Build a project-native TypeScript server, zod intent/event protocol, Postgres
  persistence model, and PixiJS/React client.
- Do not preserve Canary's C++ class hierarchy, file layout, binary packets,
  Lua runtime, database schema, global mutable architecture, or synchronous I/O
  merely because the reference implementation uses them.
- Re-express selected mechanics and data in small typed structures that satisfy
  this repository's server-authoritative tick, visibility, security, and atomic
  ownership rules.
- Treat converted static data as validated, versioned build input. Canary and
  OTClient must never be runtime dependencies of the game.
- Match Tibia behavior where it serves the game, but prefer this project's
  architecture and product decisions when exact compatibility would conflict
  with the use case.

## What exists now

- Supabase users authenticate to a rate-limited WebSocket server.
- The server owns a fixed tick, intent queues, cardinal movement, occupancy,
  view-range player visibility, and one live session per account.
- The converted OTServBR map provides z=7 server walkability and client map
  regions for z=0..7.
- The client streams static map regions, draws the Tibia atlases, animates
  player walking, and renders other connected players.
- Inventory and status components exist only as Storybook/mock UI. They are
  not backed by protocol or server state.

Everything else is absent or partial: characters, saved position/stats,
multi-floor movement, map-item animation, correct creature elevation, monster
and NPC spawns, item ownership, combat, loot, chat, shops, quests, and the
long-tail social/economy systems.

## Reference implementation map

Use these locations to understand behavior and data, then implement the result
in the project-native architecture above.

| Need | Canary / OTClient reference locations |
|---|---|
| OTBM nodes and attributes | [`src/io/io_definitions.hpp`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/src/io/io_definitions.hpp), [`src/io/iomap.cpp`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/src/io/iomap.cpp) |
| Static item rules and floor-change directions | [`data/items/items.xml`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/data/items/items.xml), [`src/items/functions/item/item_parse.cpp`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/src/items/functions/item/item_parse.cpp) |
| Stair/ramp destination rules | [`src/items/tile.cpp`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/src/items/tile.cpp), [`src/game/game.cpp`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/src/game/game.cpp) |
| Monster positions | [`data-otservbr-global/world/otservbr-monster.xml`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/data-otservbr-global/world/otservbr-monster.xml) |
| NPC positions | [`data-otservbr-global/world/otservbr-npc.xml`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/data-otservbr-global/world/otservbr-npc.xml) |
| Monster definition shape | [`data-otservbr-global/monster/mammals/rat.lua`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/data-otservbr-global/monster/mammals/rat.lua), [`src/creatures/monsters/monsters.hpp`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/src/creatures/monsters/monsters.hpp) |
| Spawn/respawn behavior | [`src/creatures/monsters/spawns/spawn_monster.cpp`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/src/creatures/monsters/spawns/spawn_monster.cpp), [`src/creatures/npcs/spawns/spawn_npc.cpp`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/src/creatures/npcs/spawns/spawn_npc.cpp) |
| Character/stat persistence shape | [`schema.sql`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/schema.sql), [`src/io/functions/iologindata_load_player.cpp`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/src/io/functions/iologindata_load_player.cpp), [`src/io/functions/iologindata_save_player.cpp`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/src/io/functions/iologindata_save_player.cpp) |
| Vocations and outfits | [`data/XML/vocations.xml`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/data/XML/vocations.xml), [`data/XML/outfits.xml`](https://github.com/opentibiabr/canary/blob/a879c9312e34381e8eedf397b8ed44510698b689/data/XML/outfits.xml) |
| Item animation timing | [`src/client/item.cpp`](https://github.com/opentibiabr/otclient/blob/bdea0b23b4a738809d698cb7e4f88a299dd6bffc/src/client/item.cpp), [`src/client/animator.cpp`](https://github.com/opentibiabr/otclient/blob/bdea0b23b4a738809d698cb7e4f88a299dd6bffc/src/client/animator.cpp) |
| Tile stack and creature draw order | [`src/client/thing.cpp`](https://github.com/opentibiabr/otclient/blob/bdea0b23b4a738809d698cb7e4f88a299dd6bffc/src/client/thing.cpp), [`src/client/tile.cpp`](https://github.com/opentibiabr/otclient/blob/bdea0b23b4a738809d698cb7e4f88a299dd6bffc/src/client/tile.cpp) |
| Visible-floor and cover rules | [`src/client/mapview.cpp`](https://github.com/opentibiabr/otclient/blob/bdea0b23b4a738809d698cb7e4f88a299dd6bffc/src/client/mapview.cpp), [`src/client/position.cpp`](https://github.com/opentibiabr/otclient/blob/bdea0b23b4a738809d698cb7e4f88a299dd6bffc/src/client/position.cpp) |

The audited global pack contains approximately 135,000 monster placements,
2,000 NPC placements, 1,650 monster definition files, and 1,000 NPC definition
files. The positions are not inside `otservbr.otbm`: the OTBM map-data node
names the external spawn XML files. Each XML spawn has a center/radius and
children with x/y offsets; the absolute floor is the spawn's `centerz`.

## Cross-cutting target model

Introduce these concepts once and reuse them throughout the feature files:

```ts
interface Position {
  x: number;
  y: number;
  z: number; // 0..15; smaller is physically higher
}

interface Outfit {
  lookType: number;
  head: number; // palette indexes, not client-supplied RGB
  body: number;
  legs: number;
  feet: number;
  addons: number;
  mount?: number;
}

type CreatureKind = "player" | "monster" | "npc";

interface CreatureState {
  id: string;
  kind: CreatureKind;
  name: string;
  position: Position;
  direction: Direction;
  outfit: Outfit;
  healthPercent: number; // exact health is sent only for the own player
}
```

- The server remains authoritative for `Position`, health, outfit ownership,
  item state, timing, and RNG.
- `CreatureState` is the visible public projection. Server-only creature
  objects also hold exact health, target, cooldowns, AI state, loot, and owner.
- Add z to spatial keys, occupancy, visibility, pathfinding, and every dynamic
  world message before adding monsters. Same x/y on two floors is not a
  collision.
- Keep static definitions (`ItemType`, `MonsterType`, `Vocation`) separate from
  mutable instances (`Item`, `Monster`, `Player`).
- Do not adopt Canary's binary network protocol, C++ runtime, Lua execution
  model, or database design. Define small zod intent/event messages and
  project-native TypeScript models for this game; keep packet limits/rates in
  `protocol/`.

## Recommended implementation order

1. Add [`generated-content safeguards and migrations`](00-foundations.md).
2. Add [`characters`](01-characters.md) and saved position/outfit.
3. Complete [`map semantics and multi-floor movement`](02-map-and-movement.md).
4. Fix [`rendering, animation, floors, and occlusion`](03-rendering-and-animation.md).
5. Add the shared [`creature and spawn runtime`](04-creatures-spawns-and-ai.md),
   then enable only a small starter region.
6. Build the [`item ownership core`](05-items-and-inventory.md).
7. Add [`progression`](06-progression.md), [`combat`](07-combat.md), and
   [`death/loot`](08-death-loot-and-decay.md).
8. Add [`chat`](09-chat.md), [`NPCs`](10-npcs.md), and
   [`economy`](11-economy.md).
9. Add [`quests/world actions`](12-quests-and-world-actions.md), then social
   and optional systems.
10. Harden [`resilience`](15-client-resilience.md),
    [`operations`](16-operations-and-security.md), and known
    [`authentication gaps`](17-auth-follow-ups.md) continuously.

Do not bulk-enable the whole global content pack until spawn loading, AI,
visibility filtering, and server tick/load benchmarks pass.
