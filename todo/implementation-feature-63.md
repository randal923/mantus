# Feature 63 — Guildhall purchase

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

## Why
Guildhalls are guild-owned houses paid from the guild balance; the import currently does not distinguish them and no guild-funded purchase path exists.

## Remaining work
- Mark guildhalls during house import (Canary guildhall flag).
- Guild-funded purchase path with leader authorization.

## Implementation
- Extend `tools/importCanaryHouses.mjs` to carry the Canary guildhall flag into `server/data/houses.json` (re-run the sha-pinned import).
- Purchase path in `server/src/house/HouseService.ts` debiting the guild balance in one serializable transaction with ledger + audit rows; leader rank re-checked at execution time inside the transaction.

## Tests
- Non-leader purchase attempts rejected at execution time.
- Racing purchase vs. guild-balance withdrawal cannot overdraw; conservation verified.
- Guildhall ownership recorded atomically with the debit.

## Dependencies
- Feature 58 (guild bank/balance).
- House purchase core (shipped).
