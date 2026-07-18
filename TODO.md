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
13. [Quests and world interactions](todo/12-quests-and-world-actions.md)
14. [Parties, guilds, houses, and social systems](todo/13-social-and-houses.md)
15. [Remaining Canary systems and client polish](todo/14-optional-features.md)
16. [Client and session resilience](todo/15-client-resilience.md)
17. [Production observability, operations, error handling, and security](todo/16-operations-and-security.md)
18. [Known authentication follow-ups](todo/17-auth-follow-ups.md)
19. [Dev tooling: GM commands and playtest harness](todo/18-dev-tooling.md)

Add a newly discovered gap to the narrowest matching feature file. Add it here
only when it needs a new feature file or changes the implementation order.
