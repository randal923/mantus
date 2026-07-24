# Feature 89 — Parity-gate rules and advanced-systems inventory

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Full parity needs both working rules (so no new feature ships client-enforced or over-sharing) and a generated inventory of everything pinned Canary exposes, so "done" is checkable rather than vibes.

## Remaining work
- Working rule: every gameplay-affecting control sends an intent — a visible cooldown/count/limit is not enforcement.
- Working rule: protocol schemas + size/rate limits + execution-time revalidation + abuse tests before enabling any new interactive feature.
- Working rule: never expose full world/bestiary/market/player data just because a UI could display it; authorized projections only.
- Tooling: maintain a generated inventory of pinned advanced systems and protocol-facing actions; the parity gate is zero unimplemented player/operator-visible entries.

## Implementation
- The first three are working rules already mirrored in `AGENTS.md` — enforce them in review; no code needed.
- The inventory needs a generator in `tools/`: scan pinned Canary (git@github.com:opentibiabr/canary.git) for player/operator-visible systems and protocol opcodes, diff against implemented protocol messages in `protocol/src/`, and emit a checked-in inventory artifact.
- The artifact feeds Feature 1's parity ledger and scopes Feature 86's long tail.

## Tests
- Generator output is deterministic for a pinned Canary sha; diff-based CI check flags new unimplemented entries.

## Dependencies
- None — this gates everything else. Ties to Feature 1 (parity ledger) and Feature 86 (long tail scoping).
