# Feature 81 — Gem atelier Canary deviations

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
The Gem Atelier shipped Canary-pinned but with five recorded deliberate deviations; full parity means retiring each with its Canary-exact behavior.

## Remaining work
- Gold is charged from bank only; Canary also consumes carried gold — add a carried-gold payment leg.
- Gems/fragments are balances, not inventory items (no 8.6-era sprites exist) — item-ification only if sprites become available.
- Drop classification uses bestiary stars/bosstiary in place of forge influenced/fiendish/archfoe monster states — switch once Feature 78 lands.
- Reveal has no temple restriction; Canary requires a temple tile — add the check.
- Destroy yields roll uniformly; Canary uses `normal_random` — switch the distribution.

## Implementation
- All in `server/src/wheel/GemAtelierService.ts`, `rollRevealedGem.ts`, and `GemDropHooks.ts`:
  - Carried-gold payment leg atomic with the bank leg (one transaction covering both sources, ledger + audit intact).
  - Temple-tile check on reveal at execution time.
  - `normal_random` for destroy yields (server RNG).
  - Drop classification switch to forge monster states once Feature 78 ships.
  - Item-ification of gems/fragments deferred unless sprites become available; keep balances otherwise and keep the deviation recorded.

## Tests
- Mixed bank+carried payment conserves gold under races (no double-spend across the two sources).
- Reveal outside a temple rejected.
- Destroy yield distribution matches `normal_random` statistically.

## Dependencies
- Feature 78 (forge monster states for drop classification).
- Bank + inventory payment path (todo-12).
- Gem atelier core (shipped).
