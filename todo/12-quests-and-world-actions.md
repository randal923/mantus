# Quests and world interactions

Depends on atomic [`items`](05-items-and-inventory.md), NPC action hooks, and
complete map semantics. World actions are typed server behaviors, never imported
scripts executed at runtime.

## Quest state

- [ ] Add typed quest/mission definitions with stable ids, names/descriptions,
  prerequisite predicates, storage keys, completion rules, rewards, and
  optional quest-log visibility.
- [ ] Persist normalized character storage/quest state with unique keys,
  bounded integer/string values, and explicit versioning.
- [ ] Derive quest state from the selected character. Never accept a client
  storage value, completed flag, reward, or next mission.
- [ ] Make reward claims and storage transitions idempotent and transactional
  with item/gold changes and audit entries.
- [ ] Send only quest-log state intended for the owning player.

## Typed world actions

- [ ] Build a small action registry keyed by item type/action id with explicit
  handlers and schemas. Unknown actions fail closed.
- [ ] Implement in increments: doors/key doors/level doors, levers/switches,
  one-time/repeatable chests, pressure plates, teleports, fields, readable and
  writeable objects, rope spots, holes/shovel, and decay/transforms.
- [ ] At execution re-check current item/version, position, reach, floor/LOS,
  requirements, cooldown, target, destination, and resulting capacity/state.
- [ ] Apply tile/item/quest changes synchronously in the tick and persist every
  coupled durable outcome atomically. Do not await between validation and
  mutation.
- [ ] Filter resulting tile/effect messages through ordinary visibility.

## Raids and world events

- [ ] Define scheduled/global events as typed state machines with stable event
  ids, bounded work per tick, announcements, spawn/action steps, and completion.
- [ ] Make durable events restart-safe and idempotent. A restart cannot create
  rewards or bosses twice.
- [ ] Drive daily resets, rewards, raids, and event start/end boundaries from
  durable server-clock schedules with idempotency keys or leases. Never use
  process startup or a daily global save as the event trigger.
- [ ] Add operator controls and audit entries for starting/canceling high-impact
  events.

## Planned file surface

- `server/db/migrations/*_character_storage.sql`,
  `server/src/quest/QuestDefinition.ts`, `QuestService.ts`,
  `server/src/action/WorldAction.ts`, `WorldActionRegistry.ts`, focused handler
  files, and `server/src/event/WorldEventManager.ts`.
- Quest/action protocol projections and client quest log/read-write/action UI.

## Required exploit tests

- [ ] A reward/chest replay grants its item/gold once, including concurrent
  intents and reconnects.
- [ ] Forged storage, action id, target, position, and destination are rejected.
- [ ] Door/lever/teleport state remains coherent for simultaneous users.
- [ ] World-event restart/retry does not duplicate spawns or rewards.
- [ ] Crossing a daily boundary while the server remains continuously online
  produces the same result as crossing it during a restart.
- [ ] Private quest state is not exposed to other players.

[Back to overview](README.md)
