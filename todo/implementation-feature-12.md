# Feature 12 — Server-side use exhausts (200 ms parity)

Part of [Todo 6 — Items and inventory](todo-6.md).

## Why

Canary applies a 200 ms exhaust per generic item use; we only have the potions' 1 s exhaust plus incidental throttles. This is a charter rule 8 violation (limits enforced only incidentally, not server-side by design). Identified by the 2026-07-18 use-surface audit.

## Remaining work

- `use-item` is currently throttled only by the single-in-flight `itemOperationPending` latch.
- `use-map` reuses the walk cooldown instead of a real use exhaust.
- Food and tool uses need explicit timers.

## Implementation

- Add a per-session use-exhaust timestamp, following the pattern of the potions' 1 s exhaust — see `/home/randal/code/tibia/server/src/item/ItemIntentHandler.ts` and the combat cooldown pattern in `applySpellCooldowns.ts` under `/home/randal/code/tibia/server/src/combat/`.
- Check the exhaust at execution time inside the tick (not at enqueue), consistent with charter rule 4.
- Canary reference: 200 ms generic use exhaust (`actions` exhaust group).

## Tests

- Regression test: rapid replayed use intents cannot exceed one use per 200 ms.

## Dependencies

- None; standalone server-side change.
