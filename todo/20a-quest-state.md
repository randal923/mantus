# Quest state and storage

Part of [`20-quests`](20-quests.md).
Depends on atomic [`items`](05-items-and-inventory.md) and NPC action hooks.

**Scheduled last in the backlog** (after social/houses and the remaining
Canary systems): quest content only consumes the platform beneath it —
storage, [`world actions`](12-world-actions.md), NPC dialogue, spawns — and
nothing else depends on it. This unit also absorbs the storage-gated world
actions deferred from 12-world-actions (quest doors, one-time
storage-keyed chests,
storage-gated teleports/tiles) and the quest-gated NPC dialogue branches
deferred from [`10b`](10b-npc-dialogue-and-travel.md).

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
- [ ] Inventory and implement every pinned quest/mission/storage definition,
  quest-log line, prerequisite, transition, and reward. Aliased/shared storage
  keys must retain their exact cross-quest behavior.

## Planned file surface

- `server/db/migrations/*_character_storage.sql`,
  `server/src/quest/QuestDefinition.ts`, `QuestService.ts`.
- Quest protocol projections and client quest log UI.

## Required exploit tests

- [ ] A reward replay grants its item/gold once, including concurrent intents
  and reconnects.
- [ ] Forged storage values, completed flags, and reward claims are rejected.
- [ ] Private quest state is not exposed to other players.
- [ ] Quest parity reports contain zero missing mission definitions, storage
  transitions, or reward callbacks.

[Back to overview](README.md)
