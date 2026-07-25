# Todo 13 — Quests

**Features 103, 104, 105.** Deliberately last: quests consume character
storage, world-action hooks (todo-2), NPC dialogue gates (todo-7), and
spawns — nothing depends on them. The quest platform does not exist
(`server/src/quest/` is absent), but the **storage substrate does**
(corrected 2026-07-25): migration `014_character_storages.sql` plus the
dirty-tracked character-store save path
(`server/src/character/sql/replaceCharacterStoragesQuery.ts`) already ship
and are consumed by shop storage gates and chest handlers. Order:
103 → 104 → 105.

## Feature 103 — Quest state and storage platform

**Remaining work**

- Typed quest/mission definitions: stable ids, names/descriptions,
  prerequisite predicates, storage keys, completion rules, rewards,
  quest-log visibility.
- Quest-state semantics over the existing `character_storages` table:
  bounded integer values, explicit versioning, Canary
  `getStorageValue`/`setStorageValue` semantics (-1 = unset).
- Derive quest state from the selected character; never accept a client
  storage value, completed flag, reward, or next-mission from the network
  (charter rule 1).
- Inventory/implement every pinned quest/mission/storage definition;
  aliased/shared storage keys retain exact cross-quest behavior.

**Implementation:** create `server/src/quest/QuestDefinition.ts` +
`QuestService.ts` on the shipped `character_storages` substrate — do not add
a second storage table.

**Tests:** storage round-trips with bounded values and versioning; quest
state derives only from the session's character (forged values rejected);
aliased keys behave identically across quests.

## Feature 104 — Atomic quest rewards and quest-log protocol

Rewards create items and gold — a prime dupe vector.

**Remaining work:** reward claims and storage transitions idempotent and
transactional with item/gold changes + audit entries (new quest-reward event
type via the drop-and-recreate constraint migration pattern; coordinate
ordering with Feature 99's partitioning); quest-log projections sent only to
the owning player, over new zod schemas (size + rate first); client
quest-log UI in `client/components/`.

**Tests (write the exploit tests first):** reward replay — concurrent
intents and reconnects — grants exactly once; forged storage
values/completed flags/claims rejected; quest-log projection contains only
the owner's state; run against the docker `playtest` DB.

## Feature 105 — Full quest-content inventory

Turn the platform into complete parity: 114 quest script directories, 624
storage-driven entries.

**Remaining work:** inventory + implement all of it, absorbing the deferred
storage-gated content from other areas — quest doors, one-time
storage-keyed chests, storage-gated teleports/tiles (todo-2), quest-gated
NPC dialogue branches (todo-7), the 67 recorded creature variants (todo-3),
and the Dawnport 7749 pile / quest-dig tool branches (todo-2). Pinned parity
covers every registered quest, mission, storage transition, quest-log line,
reward, and quest-scripted world interaction.

**Implementation:** a parity-extraction tool in `tools/` mirroring
`parseCanarySpells.mjs`, run over Canary
`data-otservbr-global/scripts/quests/` + the storage definitions; content
shipped as data consumed by `QuestService`; the gate ties into Feature 1's
ledger and Feature 89's tooling. **Needs the pinned Canary checkout.**

**Tests:** parity gate at zero missing definitions/transitions/callbacks;
spot scenario tests (door gating, one-time chest, storage-gated teleport,
quest-gated dialogue branch).

[Back to overview](README.md)
