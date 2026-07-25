# Feature 42 — Travel bank-fallback payment

Part of [Todo 11 — NPCs, dialogue, and travel](todo-11.md).

Shipped 2026-07-25 — see the
[completed log](completed/implementation-feature-42-completed.md). Travel fares
now spend carried coins first and cover any shortfall from the bank in the same
serializable transaction, with a ledger row and the split recorded in the
`npc-travel` audit entry. The store also moved onto the shared
serializable-retry helper.
