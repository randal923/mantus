# Quests and world interactions

Depends on atomic [`items`](05-items-and-inventory.md), NPC action hooks, and
complete map semantics. World actions are typed server behaviors, never imported
scripts executed at runtime.

Pinned parity includes every registered quest, storage transition, action,
move event, creature event, global event, raid, scheduled reset, and scripted
world interaction. The split below is implementation order, not a subset.

Split into one-session units; implement in order:

1. [Quest state and storage](12a-quest-state.md)
2. [Typed world actions](12b-world-actions.md)
3. [Raids and world events](12c-raids-and-world-events.md)

[Back to overview](README.md)
