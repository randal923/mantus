# Feature 103 — Quest state and storage platform

Part of [Todo 21 — Quests](todo-21.md).

## Why
Quests are the largest untouched content area (114 quest script directories, 624 storage-driven entries in Canary) and everything in them rides on character storage. Nothing exists yet: `server/src/quest/` is absent and there is no `character_storage` migration (latest is 036).

## Remaining work
- Typed quest/mission definitions: stable ids, names/descriptions, prerequisite predicates, storage keys, completion rules, rewards, quest-log visibility.
- Persist normalized character storage/quest state: unique keys, bounded integer/string values, explicit versioning.
- Derive quest state from the selected character; never accept a client storage value, completed flag, reward, or next-mission from the network (charter rule 1).
- Inventory/implement every pinned quest/mission/storage definition; aliased/shared storage keys must retain exact cross-quest behavior.

## Implementation
- To create: `server/db/migrations/*_character_storage.sql`, `server/src/quest/QuestDefinition.ts`, `server/src/quest/QuestService.ts`.
- Note: the perf pass added dirty-tracked storage saves — reconcile the new migration with whatever storage table that work touches in `server/src/character/`.
- Storage keys mirror Canary `getStorageValue`/`setStorageValue` semantics.

## Tests
- Storage persistence round-trips with bounded values and versioning.
- Quest state derives only from the session's character; forged client values rejected.
- Aliased/shared storage keys behave identically across quests.

## Dependencies
- Item system (todo-6, Features 11–17) for reward items.
- NPC action hooks (Features 37–41) and world-action hooks (Features 50–53) for quest triggers.
- Feature 104 builds directly on this platform.
