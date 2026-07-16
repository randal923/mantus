# Item decay and transforms

Part of [`08-death-loot-and-decay`](08-death-loot-and-decay.md). Depends on
atomic [`items`](05-items-and-inventory.md) and the corpse lifecycle from
[`08a-monster-death-and-loot`](08a-monster-death-and-loot.md).

## Decay

- [ ] Add a bounded tick-owned `DecayManager`; timer callbacks may enqueue work
  but never directly mutate shared world state.
- [ ] Track transform/remove deadlines with server time and documented restart
  semantics. Corpse container access must close/reconcile when it transforms.
- [ ] Re-check item identity, version, and location at execution so moving an
  item cannot cause a stale decay job to destroy its replacement.

## Planned file surface

- `server/src/item/DecayManager.ts` and persistence additions for decay
  deadlines where durable.

## Required exploit tests

- [ ] A stale decay task cannot remove a moved/transformed/new item instance.
- [ ] Decay deadlines survive restart per the documented semantics without
  duplicating or skipping transforms.

[Back to overview](README.md)
