# Feature 105 — Full quest-content inventory

Part of [Todo 21 — Quests](todo-21.md).

## Why
Phase 2 of the quest area: turn the platform into complete Canary parity. 114 quest script directories and 624 storage-driven entries must be inventoried and implemented, and this phase absorbs the storage-gated content deliberately deferred from other areas.

## Remaining work
- Inventory and implement all 114 quest script directories / 624 storage-driven entries.
- Absorb the deferred storage-gated world actions: quest doors, one-time storage-keyed chests, storage-gated teleports/tiles (deferred from the world-actions area, Features 50–53).
- Absorb quest-gated NPC dialogue branches (deferred from the NPC area, Features 37–42).
- Pinned parity includes every registered quest, mission, storage transition, quest-log line, reward, and quest-scripted world interaction.

## Implementation
- Parity-extraction tool in `tools/` mirroring `tools/parseCanarySpells.mjs`, run over Canary `data-otservbr-global/scripts/quests/` plus the storage definitions.
- Content shipped as data consumed by Feature 103's `QuestService`.
- Parity gate ties into Feature 1's ledger and Feature 89's parity-gate tooling.

## Tests
- Parity gate: zero missing quest definitions, storage transitions, or callbacks against the pinned Canary inventory.
- Spot scenario tests for representative quests (door gating, one-time chest, storage-gated teleport, quest-gated dialogue branch).

## Dependencies
- Features 103 and 104 (platform and reward/protocol layer).
- Features 50–53 (world-action hooks) and 37–41 (NPC dialogue gates) must expose the storage-gated hook points.
- Feature 1 / Feature 89 (parity ledger and gate tooling).
