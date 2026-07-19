# TODO

The implementation backlog for the project-native rewrite is split by feature
under [`todo/`](todo/README.md). Start with the overview for the reference
repositories, shared architecture, dependencies, and recommended implementation
order.

Cross-cutting completion is tracked in the
[pinned Canary feature-parity ledger](todo/00a-canary-parity.md). A feature
slice may ship incrementally, but the pinned parity target is not complete
until that ledger has no unsupported player- or operator-visible content.

## Backlog index

Quest content is deliberately scheduled last. In the pinned Canary baseline it
is the largest pure-content layer (114 quest script directories, 624 of them
storage-driven) and it only consumes the platform beneath it — character
storage, typed world actions, NPC dialogue, spawns. Nothing else in the
backlog depends on quest content, so deferring it blocks nothing. The
world-interaction units that used to share its slot stay in the middle of the
order: typed world actions gate map traversal (ropes, holes, doors) and house
doors, and raids are storage-free spawn schedules.

1. [Foundations: generated content and migrations](todo/00-foundations.md)
2. [Characters and saved world entry](todo/01-characters.md)
3. [Map semantics, stairs, and multi-floor movement](todo/02-map-and-movement.md)
4. [Rendering, terrain animation, floors, and occlusion](todo/03-rendering-and-animation.md)
5. [Creatures, world spawns, respawns, and AI](todo/04-creatures-spawns-and-ai.md)
6. [Items, inventory, equipment, and map use](todo/05-items-and-inventory.md)
7. [Vocations, stats, and progression](todo/06-progression.md)
8. [Combat, spells, and conditions](todo/07-combat.md)
9. [Death, corpses, loot, and decay](todo/08-death-loot-and-decay.md)
10. [Chat and channels](todo/09-chat.md)
11. [NPCs, dialogue, and travel](todo/10-npcs.md)
12. [Shops, banking, depot, trade, and market](todo/11-economy.md)
13. [Typed world actions](todo/12-world-actions.md) — the storage-gated
    quest variants (quest doors, one-time chests) are deferred to the quest
    phase.
14. [Raids and world events](todo/13-raids-and-world-events.md)
15. [Parties, guilds, houses, and social systems](todo/14-social-and-houses.md)
16. [Remaining Canary systems and client polish](todo/15-optional-features.md)
17. [Client and session resilience](todo/16-client-resilience.md)
18. [Production observability, operations, error handling, and security](todo/17-operations-and-security.md)
19. [Known authentication follow-ups](todo/18-auth-follow-ups.md)
20. [Dev tooling: GM commands and playtest harness](todo/19-dev-tooling.md)
21. [Quests: state, storage, and all quest content](todo/20-quests.md)
    — implemented last; starts with [quest state](todo/20a-quest-state.md).

Entries 17–20 are continuous hardening/support tracks worked alongside the
features, not strict predecessors of the quest phase.

Add a newly discovered gap to the narrowest matching feature file. Add it here
only when it needs a new feature file or changes the implementation order.
