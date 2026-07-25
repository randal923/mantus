# Todo 11 — NPCs, dialogue, and travel

The NPC import and conversation baseline shipped: all 1,008 external-XML placements and 956 statically parsed types, generated keyword-tree dialogue for all 949 interactive types, per-character conversation state with strict re-validation, and a full boat-travel vertical slice (16 coastal NPCs, 90 pinned routes, serializable atomic payment) — see [done.md](done.md). What remains is the parity grind: the complete typed `NpcType` model, typed commands for 2,307 procedural keyword actions and 601 custom callbacks, import-validation hardening, the formal dialogue-graph engine, gated/quest travel routes, and bank-fallback fares.

## Remaining features

- [x] **Feature 37 — Complete typed NpcType data model** — Every declared NPC behavior field carried typed; NPC parity gaps in the creature report fell 956 → 3. Shipped 2026-07-25; see [completed log](completed/implementation-feature-37-completed.md).
- [ ] **Feature 38 — Typed commands for procedural NPC behavior** — Convert every procedural gap (2,307 keyword actions, 21 composed messages, 601 callbacks) into reviewed typed TypeScript commands; no Lua. See [implementation](implementation-feature-38.md).
- [x] **Feature 39 — NPC import validation and parity reports** — Fail-closed import-time validation plus a whole-world destination proof and a pinned parity gate. Shipped 2026-07-25; see [completed log](completed/implementation-feature-39-completed.md).
- [ ] **Feature 40 — Dialogue-graph engine completion** — Formal typed graph with conditions and quest requirements, execution-time re-validation of every node/action, parity fixture over all imported dialogue. See [implementation](implementation-feature-40.md).
- [ ] **Feature 41 — Gated and quest travel routes** — Storage-gated Yalahar/Goroma passages, quest/event boats, Postman discounts and mission side effects, kick actions. See [implementation](implementation-feature-41.md).
- [ ] **Feature 42 — Travel bank-fallback payment** — Fare collection falls back to bank balance like Canary's `removeMoneyBank`; bank has shipped, implementable now. See [implementation](implementation-feature-42.md).

[Back to overview](README.md)
