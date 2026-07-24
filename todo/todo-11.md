# Todo 11 — NPCs, dialogue, and travel

The NPC import and conversation baseline shipped: all 1,008 external-XML placements and 956 statically parsed types, generated keyword-tree dialogue for all 949 interactive types, per-character conversation state with strict re-validation, and a full boat-travel vertical slice (16 coastal NPCs, 90 pinned routes, serializable atomic payment) — see [done.md](done.md). What remains is the parity grind: the complete typed `NpcType` model, typed commands for 2,307 procedural keyword actions and 601 custom callbacks, import-validation hardening, the formal dialogue-graph engine, gated/quest travel routes, and bank-fallback fares.

## Remaining features

- [ ] **Feature 37 — Complete typed NpcType data model** — Typed data for outfit, home/leash, speech triggers, dialogue graph, travel offers, shop id, quest/storage gates, scripted action references. See [implementation](implementation-feature-37.md).
- [ ] **Feature 38 — Typed commands for procedural NPC behavior** — Convert every procedural gap (2,307 keyword actions, 21 composed messages, 601 callbacks) into reviewed typed TypeScript commands; no Lua. See [implementation](implementation-feature-38.md).
- [ ] **Feature 39 — NPC import validation and parity reports** — Fail-closed import validation for definitions, aliases, blocked positions, duplicate ids, unavailable destinations, unsupported callbacks; parity-zero reporting. See [implementation](implementation-feature-39.md).
- [ ] **Feature 40 — Dialogue-graph engine completion** — Formal typed graph with conditions and quest requirements, execution-time re-validation of every node/action, parity fixture over all imported dialogue. See [implementation](implementation-feature-40.md).
- [ ] **Feature 41 — Gated and quest travel routes** — Storage-gated Yalahar/Goroma passages, quest/event boats, Postman discounts and mission side effects, kick actions. See [implementation](implementation-feature-41.md).
- [ ] **Feature 42 — Travel bank-fallback payment** — Fare collection falls back to bank balance like Canary's `removeMoneyBank`; bank has shipped, implementable now. See [implementation](implementation-feature-42.md).

[Back to overview](README.md)
