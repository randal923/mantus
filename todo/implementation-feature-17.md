# Feature 17 — Pinned Canary item-parity gate

Part of [Todo 6 — Items and inventory](todo-6.md).

## Why

Item parity is only done when every registered item/move/action behavior from pinned Canary has been inventoried and implemented, and the generated reports reach zero silently ignored gameplay attributes.

## Remaining work

- Inventory and implement all player-visible item semantics: containers, fluids, food, readable/writeable, doors, keys, beds, fields, decay/transforms, reward containers, stash/mail/depot rules, equipment modifiers, charges, imbuement slots, forge tiers, quick-loot/loot-container configuration, browse-field/seek/parent-container actions, inspection, wrapping, hotkey equip, show-off sockets, special-use callbacks.
- Reports and tests must distinguish non-content/reserved ids from gameplay items so the zero target is meaningful.

## Implementation

- Extend `/home/randal/code/tibia/tools/buildCanaryParityInventory.mjs` and `/home/randal/code/tibia/tools/verifyCanaryParityInventory.mjs` against `/home/randal/code/tibia/content/canary-parity-inventory.json`.
- Per-behavior implementation work lives in the delegated todos (see Dependencies); this feature owns the inventory tooling and the gate.
- Add a gate test asserting zero-unreviewed entries over the generated report, following the pattern of the creature-side gate (Feature 10).

## Tests

- Gate test: parity inventory report contains zero unreviewed/ignored gameplay attributes; non-content ids are explicitly classified, not silently skipped.
- Re-running the inventory tool against the pinned Canary checkout is deterministic.

## Dependencies

- Features 11–16 in this todo.
- Delegated behavior owners: Todo 9 (Features 29–31, 33–34), Todo 12 (Features 47–49), Todo 13 (Features 50–53), Todo 15 (Features 61–64), Todo 16 (Features 78, 86).
