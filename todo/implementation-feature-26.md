# Feature 26 — Spell report zero-disabled gate

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

## Why

The generated spell report must distinguish examples/non-content from registered gameplay definitions and reach zero disabled registered spells, zero disabled runes, zero ignored formula fields, and zero unreviewed callbacks. Current state: 236 total / 166 supported / 70 unsupported (2026-07-25).

## Remaining work

- Classify examples/non-content entries explicitly so the zero target is meaningful.
- Drive the unsupported count (currently 70) to zero via the callback and area features.
- Add gate assertions that lock the zero state once reached.

## Implementation

- Report generation in `/home/randal/code/tibia/tools/parseCanarySpells.mjs` and `/home/randal/code/tibia/tools/importCanarySpells.mjs`.
- Gate assertions in `/home/randal/code/tibia/server/src/combat/loadCanarySpellCatalog.test.ts`: zero disabled registered spells/runes, zero ignored formula fields, zero unreviewed callbacks.

## Tests

- The gate test itself, plus a determinism check that regenerating the report from the pinned Canary checkout is stable.

## Dependencies

- Feature 24 (support-spell callbacks), Feature 25 (combat areas), and the delegated branches in Todo 15 (Features 55–57, 61–66) and Todo 16 (Features 79–82, 85).
