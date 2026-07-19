# Playable-world backlog overview

Parity audit refreshed 2026-07-16 against the current repository and these pinned
upstream snapshots:

- [Canary `a879c931`](https://github.com/opentibiabr/canary/tree/a879c9312e34381e8eedf397b8ed44510698b689)
  (server mechanics and OTServBR Global content).
- [OpenTibiaBR OTClient `bdea0b23`](https://github.com/opentibiabr/otclient/tree/bdea0b23b4a738809d698cb7e4f88a299dd6bffc)
  (rendering and client behavior; MIT).

This is an implementation backlog for full player- and operator-visible
gameplay and content parity with the pinned Canary baseline. Features may land
incrementally in dependency order, but “later” and “unsupported” describe
scheduling, not a reduced final scope. The
[`pinned Canary parity ledger`](00a-canary-parity.md) is the cross-cutting
completion contract. `AGENTS.md` and the project security charter are
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
- Re-express all player- and operator-visible mechanics and content from the
  pinned baseline in small typed structures that satisfy this repository's
  server-authoritative tick, visibility, security, and atomic ownership rules.
- Treat converted static data as validated, versioned build input. Canary and
  OTClient must never be runtime dependencies of the game.
- Match pinned Canary gameplay behavior and content. Prefer this project's
  architecture and stricter security when exact internal compatibility would
  conflict with the authoritative tick, visibility, atomicity, or operational
  model; do not use architectural differences to omit player- or
  operator-visible features.

## Full parity contract

- Importers and audits must inventory every registered gameplay definition,
  placement, callback, persistent system, and content action in the pinned
  sources. Every entry has an owner TODO and a testable status.
- A starter-region rollout, dependency blocker, or temporary importer
  limitation may delay enablement, but cannot remove the entry from the parity
  ledger.
- Completion requires zero unreviewed callbacks, ignored gameplay fields, or
  unsupported registered content. Examples and internal implementation files
  may be classified as non-content with an explicit stable reason.
- Canary's C++/Lua runtime, binary protocol, schema, unsafe trust boundaries,
  and global-save architecture remain outside scope; their player- and
  operator-visible outcomes remain in scope.

## What exists now

- Supabase users authenticate to a rate-limited WebSocket server.
- Accounts own persisted characters selected before entering the world;
  position, direction, private stats, and saved outfits survive reconnects.
- The server owns a fixed tick, intent queues, speed/ground-timed cardinal
  movement, z-aware occupancy and visibility, explicit floor transitions and
  map actions, and one live session per account.
- The converted OTServBR map provides validated server navigation, mutable item
  placements, towns/content references, and public immutable client regions
  for all floors z=0..15.
- The client streams floor-aware static regions, reconciles visible mutable
  tile items and creatures, snaps authoritative corrections/floor changes, and
  animates accepted same-floor player steps.
- A pinned Canary/DAT item catalog now backs durable starter equipment,
  inventory projections, canonical tooltips, and an authoritative first slice
  of equip, pickup/drop, stack, and rotate operations.

Remaining systems are absent or partial: deeper container/map-use behavior,
the disabled spell/rune catalog entries, complete creature/NPC callbacks and
fields, loot/death, chat, shops, quests, and the long-tail social, economy, and
modern progression systems.

## Reference implementation map

Use these locations to understand behavior and data, then implement the result
in the project-native architecture above. This table is a starting map, not an
exhaustive feature inventory; the parity ledger must also inventory registered
protocol actions, scripts, XML systems, persistence tables, and player
components from the pinned source.

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

The current generated world pack contains 83,286 monster placements, 1,008 NPC
placements, 897 monster types, and 956 NPC types. The positions are not inside
`otservbr.otbm`: the OTBM map-data node names the external spawn XML files.
Each XML spawn has a center/radius and children with x/y offsets; the absolute
floor is the spawn's `centerz`. The parity ledger separately tracks ignored
fields, callbacks, ambiguous definitions, and invalid placements; importing a
placement count does not by itself prove behavioral parity.

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

### Continuous durability instead of a daily global save

- Correctness must never depend on a Tibia-style daily global save, map clean,
  or process restart. Persist ordinary dirty character state continuously
  within a documented bounded window and flush it on logout and graceful
  shutdown.
- Commit item ownership, gold, trades, quest rewards, house transfers, market
  operations, and audit entries immediately in their feature transaction. A
  later player save must never be able to duplicate or roll them back.
- Drive daily rewards, rent, raids, and world-event boundaries from durable,
  idempotent schedules using the server clock. Startup or shutdown is not a
  calendar event.
- Use PostgreSQL backups and point-in-time recovery independently of the game
  process. Graceful draining, deployment restarts, and maintenance mode remain
  supported, but a scheduled daily outage is not required for durability.
- Rebuild disposable in-memory indexes from durable state after a crash. Test
  crash/restart boundaries explicitly so no persistent system quietly depends
  on a global-save command.

## Recommended implementation order

1. Add [`generated-content safeguards and migrations`](00-foundations.md).
2. Add [`characters`](01-characters.md) and saved position/outfit.
3. Complete [`map semantics and multi-floor movement`](02-map-and-movement.md).
4. Fix [`rendering, animation, floors, and occlusion`](03-rendering-and-animation.md).
5. Add the shared [`creature and spawn runtime`](04-creatures-spawns-and-ai.md),
   enable a small starter region for rollout, then retain full-world parity as
   the required completion target.
6. Build the [`item ownership core`](05-items-and-inventory.md).
7. Add [`progression`](06-progression.md), [`combat`](07-combat.md), and
   [`death/loot`](08-death-loot-and-decay.md).
8. Add [`chat`](09-chat.md), [`NPCs`](10-npcs.md), and
   [`economy`](11-economy.md).
9. Add [`typed world actions`](12-world-actions.md) and
   [`raids/world events`](13-raids-and-world-events.md). Storage-gated quest
   variants (quest doors, one-time chests) are deferred to the quest phase.
10. Add [`social and houses`](14-social-and-houses.md) and the
    [`remaining Canary parity systems`](15-optional-features.md).
11. Harden [`resilience`](16-client-resilience.md),
    [`observability and operations`](17-operations-and-security.md), and known
    [`authentication gaps`](18-auth-follow-ups.md) continuously.
12. Implement quests last: [`quest state and storage`](20a-quest-state.md),
    then the full quest-content inventory (definitions, missions, rewards,
    quest log, storage-gated world actions, quest-gated NPC dialogue). Quest
    content is the largest pure-content layer in the pinned baseline and only
    consumes the platform built in steps 1–10; nothing else depends on it.

The larger feature files (08, 10, 11, 14, 16, 17, 20) are split into lettered
one-session units (for example `11a-currency-and-bank.md`); each parent file is
a short index giving the order within that feature. Implement one lettered unit
per session/PR — never more than one economy-relevant system in a single PR.

Do not bulk-enable the whole global content pack until spawn loading, AI,
visibility filtering, and server tick/load benchmarks pass.
