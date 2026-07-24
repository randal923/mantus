# Todo 6 — Items and inventory

The core item system shipped: a typed `ItemType` catalog pinned to source hashes, a single-owner `items` table with constrained locations and audit-logged transactions, bounded zod intents with execution-time re-checks, memory-first item ops with guarded single-transaction persistence, the optimistic client drag queue, and the full exploit-test suite for dupes, races, and replays (see [done.md](done.md)). What remains is the delegated world-interaction behavior umbrella, use exhausts, trash holders, client walk-then-use QoL, the process-kill crash harness, a list of recorded optimistic-queue/persistence refinements, and the final pinned Canary item-parity gate.

## Remaining features

- [ ] **Feature 11 — Typed world-interaction behaviors (delegated umbrella)** — doors, switches, fields, decay, beds, depots, and quest actions as typed server behaviors; mostly delegated, with direct gaps in sorting, browse-field, and fluids. See [implementation](implementation-feature-11.md).
- [x] **Feature 12 — Server-side use exhausts (200 ms parity)** — Canary applies a 200 ms exhaust per generic item use; we only have the potions' 1 s exhaust plus incidental throttles. **Done 2026-07-24** — see [completed log](completed/implementation-feature-12-completed.md).
- [x] **Feature 13 — Trash holders** — 79 catalog types with `kind: "trashholder"` must destroy dropped/thrown items with effect and audit entry. **Done 2026-07-24** — see [completed log](completed/implementation-feature-13-completed.md).
- [x] **Feature 14 — Client walk-then-use auto-retry** — auto-walk adjacent and retry once when a use/pickup target is out of reach; client-only. **Done 2026-07-24** — see [completed log](completed/implementation-feature-14-completed.md).
- [x] **Feature 15 — Process-kill crash durability harness** — the one unchecked exploit test: abrupt process death around an ownership transaction leaves the item in exactly one durable location. **Done 2026-07-24** (harness; one accepted limitation still tracked) — see [completed log](completed/implementation-feature-15-completed.md).
- [ ] **Feature 16 — Optimistic-queue and persistence-path refinements** — accepted limitations of the client drag queue and memory-first persistence, each with a recorded fix. Umbrella; slices done 2026-07-24 (throw/drop LOS lock, nonce echo) in [completed log](completed/implementation-feature-16-completed.md). See [implementation](implementation-feature-16.md).
- [ ] **Feature 17 — Pinned Canary item-parity gate** — every registered item/move/action behavior inventoried and implemented; reports reach zero silently ignored gameplay attributes. See [implementation](implementation-feature-17.md).

[Back to overview](README.md)
