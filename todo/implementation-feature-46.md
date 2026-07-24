# Feature 46 — NPC shop parity completions

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

## Why
NPC shops shipped with the full pinned catalog import and all exploit tests, but three Canary behaviors are missing: sale proceeds that don't fit inventory should credit the bank, purchases should fill the open backpack, and finite stock has durable race-safe plumbing (`reserveShopStock.ts`) but no catalog uses it and nothing restocks.

## Remaining work
- Sale proceeds bank fallback: Canary credits the bank when sale proceeds don't fit inventory; here the sale fails atomically instead.
- Buy into backpacks/shopping bags: Canary places purchases into the open backpack (or sells shopping bags); here purchases only use existing stacks or free top-level slots.
- Shop stock restock schedule: finite stock is durable and race-safe via `reserveShopStock.ts` but unused — no production catalog defines stock, and nothing restocks.

## Implementation
- Bank fallback: in `server/src/economy/executeShopSale.ts` / `PgShopStore.ts`, when `planMoneyGrant` cannot place all coins, credit the remainder to `bank_accounts` via `creditBankBalance.ts` + `appendBankLedger.ts` in the same SERIALIZABLE transaction; the audit entry reflects the split. This mirrors the shipped `spendMarketFunds` pattern.
- Backpack destinations: extend destination planning in `server/src/economy/executeShopPurchase.ts` (plus `BackpackSlots.ts` / `BackpackSlotLocker.ts`) to descend into the equipped backpack, respecting the 100-item container cap and carry capacity, re-checked at execution time inside the transaction (charter rule 4). This logic is reusable for bank withdrawals (Feature 45).
- Restock: catalog content declared via `loadShopCatalogs.ts`; restock runs as a durable server-clock schedule — idempotent and lease-keyed, the same discipline as the world event engine — updating stock rows transactionally.

## Tests
- Sale with a full inventory credits the bank exactly, conserves currency, and commits in a single transaction.
- Purchase fills the backpack before loose slots; concurrent purchases cannot overfill one slot.
- Restart across a restock boundary restocks exactly once (idempotency/lease test).

## Dependencies
- Durable scheduling infrastructure (shared with Feature 54, world event engine).
- Feature 45 reuses the backpack destination planning for withdrawals.
