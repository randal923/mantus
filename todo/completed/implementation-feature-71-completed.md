# Feature 71 — completed

Mounts, from [implementation-feature-71.md](../implementation-feature-71.md).

Cross-links: [todo-16.md](../todo-16.md),
[Feature 70](implementation-feature-70-completed.md).

---

## 2026-07-25 — Mount entitlements and a server-authoritative speed bonus

**Problem.** Mounts are entitlements *with a gameplay effect*, so both the
ownership and the speed bonus have to be server truth.

**What changed.** `character_mounts` and `characters.mount_id` (migration
`053_outfits_and_mounts.sql`) reuse Feature 70's entitlement pattern: the
mount arrives on the same `outfit-select` intent and is re-checked in the same
transaction as the outfit, so a claimed-but-unowned mount is refused and the
selection writes nothing.

The speed bonus comes from the pinned `outfitCatalog`, never from anything the
client sends: `OutfitService.applyMountSpeed` sets `Player.mountSpeedBonus`
from `MOUNTS.get(mountId).speed`, and `Player.stepSpeed` — the value the walk
cooldown is computed from — includes it. A client claiming mounted speed while
unmounted is therefore not "snapped back" so much as never believed: the
server's own `stepSpeed` is the only input to step timing (charter rule 8).

Public creature state carries `mountLookType`, the mount's outfit sprite, not
the entitlement id — viewers learn only what they must render.

**Files touched.**
`server/db/migrations/053_outfits_and_mounts.sql`,
`server/src/outfit/{OutfitService,OutfitStore,PgOutfitStore,MemoryOutfitStore,outfitCatalog}.ts`,
`server/src/Player.ts`, `protocol/src/{outfit,creature}.ts`.

**How it was verified.** `OutfitService.test.ts` — selecting an unowned mount
is refused and changes neither the mount nor `stepSpeed`; after the grant the
same selection sets the mount, raises `stepSpeed` by exactly the catalog bonus
(Midnight Panther, +20), and publishes the mount's sprite in creature state.

**Residual risk / deferred.** **Client mounted rendering is not done.** The
sprites exist in the pinned assets (mount look types 368–377 are ordinary
outfit objects) and the protocol already carries `mountLookType`, but drawing
the mount under the rider means a second sprite layer inside `CreatureView`,
subject to the pattern/layer gotchas in `client/ASSETS.md`. Left out rather
than half-implemented against a renderer that cannot be visually verified
here. Mount unlock sources (store, quests, achievements) are open for the same
reason as Feature 70's.
