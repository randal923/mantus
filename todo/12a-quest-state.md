# Quest state and storage

Part of [`12-quests-and-world-actions`](12-quests-and-world-actions.md).
Depends on atomic [`items`](05-items-and-inventory.md) and NPC action hooks.

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
