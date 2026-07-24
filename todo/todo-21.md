# Todo 21 — Quests

Nothing in this area is implemented: `server/src/quest/` does not exist and there is no `character_storage` migration (latest migration is 036). Quests are deliberately last in the backlog — they consume character storage, world-action hooks (Features 50–53), NPC dialogue gates (Features 37–41), and spawns, but nothing depends on them. Order within the area: Feature 103 (platform) first, then Feature 104 (atomic rewards + quest-log protocol), then Feature 105 (the full 114-directory / 624-storage-entry content inventory, which also absorbs the deferred quest doors, one-time chests, storage-gated teleports/tiles, and quest-gated NPC dialogue branches deferred from the world-actions and NPC areas).

## Remaining features

- [ ] **Feature 103 — Quest state and storage platform** — Typed quest/mission definitions and persisted, server-derived character storage with Canary `getStorageValue`/`setStorageValue` semantics. See [implementation](implementation-feature-103.md).
- [ ] **Feature 104 — Atomic quest rewards and quest-log protocol** — Idempotent, transactional reward claims with audit entries, and owner-only quest-log projections over new zod schemas. See [implementation](implementation-feature-104.md).
- [ ] **Feature 105 — Full quest-content inventory** — Parity-extract and implement every pinned Canary quest, mission, storage transition, reward, and quest-scripted world interaction. See [implementation](implementation-feature-105.md).

[Back to overview](README.md)
