# Feature 86 — Modern-systems long tail

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Beyond the named features, pinned Canary registers further modern systems. Parity is defined by the generated inventory (Feature 89 / Feature 1's ledger), and each entry it finds must ship as its own bounded unit.

## Remaining work
- Hazard levels.
- Concoctions.
- Encounter/boss difficulty selection.
- Resource balances.
- Podium/show-off objects.
- Livestream/casting (also listed in Feature 67).
- Every other registered modern system found by the parity inventory.

## Implementation
- Each system as its own bounded unit following the standard order: protocol zod schema + size/rate limits first, server-authoritative execution with execution-time re-checks, durable state, audit rows for anything economy-relevant.
- Scope each unit from the Feature 89 inventory artifact rather than ad hoc discovery, so nothing pinned is missed.

## Tests
- Per-system exploit/regression tests per the definition-of-done checklist (races, replay, out-of-range input, negative balances).

## Dependencies
- Feature 89 (parity inventory tooling) and Feature 1 (parity ledger) define the concrete list.
