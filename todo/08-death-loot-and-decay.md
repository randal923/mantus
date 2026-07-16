# Death, corpses, loot, and decay

Depends on [`combat`](07-combat.md) and atomic [`items`](05-items-and-inventory.md).
Deaths, loot rolls, corpse creation, and decay are server outcomes and must be
idempotent across races and restarts.

Split into one-session units; implement in order:

1. [Monster death, corpses, and loot](08a-monster-death-and-loot.md)
2. [Player death and penalties](08b-player-death.md)
3. [Item decay and transforms](08c-decay.md)

[Back to overview](README.md)
