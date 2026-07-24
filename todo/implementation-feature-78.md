# Feature 78 — Imbuements, item tiers, and Exaltation Forge

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
The forge complex (imbuements, classification/tiers, Exaltation Forge, forge resources, influenced/fiendish monsters) is a major pinned Canary item system with heavy economy exposure — every conversion must be atomic and audited. It also unblocks the gem atelier's correct drop classification (Feature 81).

## Remaining work
- Imbuements.
- Item classification/tiering.
- Exaltation Forge + forge history.
- Dust/slivers/cores resources.
- Influenced/fiendish monsters.
- Atomic conversions throughout.
- Related deviation to retire: gem drop classification currently uses bestiary stars/bosstiary in place of forge influenced/fiendish/archfoe — replace once forge monster states exist.

## Implementation
- Item attribute extensions on the items model (tier, imbuement slots/charges) — items remain single-owner rows; attribute changes are single-step mutations (charter rule 2).
- Forge conversions (fusion, transfer, dust/sliver/core exchanges) each as one ACID transaction with audit rows; tier upgrade/downgrade rolls use server RNG inside the transaction.
- Forge history table written in the same transactions.
- Influenced/fiendish state assigned server-side at monster spawn; loot/resource drops keyed off that state.
- Bounded zod intents in `protocol/` (schema + size/rate before handlers); all costs and prerequisites re-checked at execution time.
- Canary reference for exact rates, costs, and tier bonuses.

## Tests
- Conversion races conserve resources (no dust/sliver/core or item duplication; failed fusions consume exactly what Canary consumes).
- Tier rolls are server-side; client-supplied outcomes impossible.
- Forge history rows match audit rows one-to-one.

## Dependencies
- Item/economy core (shipped, todo-12).
- Monster spawn system (todo-5).
- Feeds Feature 81 (gem drop classification switch).
