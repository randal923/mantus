# Item decay and transforms

Part of [`08-death-loot-and-decay`](08-death-loot-and-decay.md). Depends on
atomic [`items`](05-items-and-inventory.md) and the corpse lifecycle from
[`08a-monster-death-and-loot`](08a-monster-death-and-loot.md).

## Decay

- [x] Add a bounded tick-owned `DecayManager`; timer callbacks may enqueue work
  but never directly mutate shared world state. `DecayManager` only keeps
  bookkeeping; `ItemIntentHandler.tickDecay` collects a bounded batch per tick
  and applies results through the outcome queue like every other item op.
- [x] Track transform/remove deadlines with server time and documented restart
  semantics. Documented semantics (see `DecayManager` doc comment): deadlines
  are in-memory only; on boot every persisted world item with decay metadata
  is re-armed with its full duration, so a transform can run late but never
  early and never twice. Corpse contents are not remotely accessible yet, so
  there is no open-container view to close on transform; when the loot UI
  lands (08a), the transform mutation must also close/reconcile open corpse
  views.
- [x] Re-check item identity, version, and location at execution so moving an
  item cannot cause a stale decay job to destroy its replacement. Guarded
  twice: an in-memory instance/version/type re-check before the store call,
  and the version-checked store transaction.
- [ ] Import every pinned decay duration, transform chain, stop condition,
  field/corpse lifecycle, and special decay callback; no gameplay item with
  decay metadata may remain display-only. Done for world (ground) items,
  including transform chains, capacity-shrinking stages that destroy overflow
  contents, and audited removal. Still missing: decay of carried/equipped
  items (`transformEquipTo`/`transformDeEquipTo`), field items created by
  spells, charge-based expiry, and stop conditions.
- [ ] Durable decay deadlines (a persisted `decay_at`) if the re-arm-on-boot
  semantics ever become exploitable (e.g. hoarding decayables across
  restarts); accepted for now because decay only ever runs late, never early.

## Planned file surface

- `server/src/item/DecayManager.ts` and persistence additions for decay
  deadlines where durable. Store execution: `ItemStore.decayWorldItem`
  (`PgItemStore` transactional, audited via `item-transformed` /
  `item-destroyed` with reason `decay`; the first transform clears
  `ownerCharacterId`, ending loot protection).

## Required exploit tests

- [x] A stale decay task cannot remove a moved/transformed/new item instance
  (`ItemIntentHandler.decay.test.ts`, `DecayManager.test.ts`, and the
  stale/racing store tests in `PgItemStore.integration.test.ts`).
- [x] Decay deadlines survive restart per the documented semantics without
  duplicating or skipping transforms (`ItemIntentHandler.decay.test.ts`
  "reschedules loaded items after restart and transforms exactly once").

[Back to overview](README.md)
