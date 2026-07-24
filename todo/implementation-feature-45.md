# Feature 45 — Bank parity and UX gaps

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

## Why
The bank core (balances, ledger, nonnegative invariants, all four exploit tests) shipped, but several Canary parity flows and UX behaviors are missing or accepted as limitations, and `BankService` carries duplicated helpers that should be deduped.

## Remaining work
- Canary free-text keyword flows not implemented: "deposit 500" in chat, `change gold/...` conversions. The panel via the NPC `bank` action covers the same operations, so this is parity, not capability.
- Guild bank absent (needs guilds).
- Online transfer recipient is not notified live — fix by pushing `bank-updated` to the recipient session on commit.
- `minTownIdToBankTransferFromMain` restriction not implemented (only one effective town exists today).
- Withdrawn coins land in loose `inventory` slots instead of the backpack.
- NPC travel fares have no bank fallback (also tracked as Feature 42).
- Refactor: `BankService` keeps private copies of `COIN_STACK_LIMIT`, `countCarried`, and `inTalkRange` (lines 29/252/274) duplicating `coinStackLimit.ts`, `countCarriedCoins.ts`, and `inNpcTalkRange.ts` — mechanical swap guarded by `BankService.test.ts`.

## Implementation
- Live notify: on commit in `server/src/economy/executeBankTransfer.ts` / `server/src/economy/BankService.ts`, push the existing `bank-updated` projection to the recipient's online session — own balance only, nothing about the sender beyond what the transfer already reveals (charter rule 6).
- Keyword flows: hook NPC dialogue (old todo 10b lane) into existing `BankService` intents; the server re-validates amount/range at execution time, and every balance change keeps the shipped one-SERIALIZABLE-transaction ledger + `audit_log` coupling.
- Travel bank fallback: mirror `server/src/market/spendMarketFunds.ts` — carried coins first, bank remainder, in the same transaction with ledger + audit.
- Backpack-destination withdrawals: reuse the shop buy-into-backpack destination planning from Feature 46.
- Helper dedup: mechanical swap in `BankService.ts` to the shared `coinStackLimit.ts`, `countCarriedCoins.ts`, `inNpcTalkRange.ts` modules; `BankService.test.ts` guards behavior.

## Tests
- Live-notify push carries only the recipient's own balance.
- Keyword-flow amounts are integer-validated and bounds-checked server-side; forged/oversized amounts rejected.
- Travel fare fallback conserves currency (carried + bank before == after + fare) under concurrency, single transaction.
- `BankService.test.ts` stays green across the helper-dedup refactor.

## Dependencies
- Guilds (Feature 58 — guild bank).
- Multi-town support (for `minTownIdToBankTransferFromMain`).
- Feature 46 (backpack destination logic).
- Feature 42 (travel bank fallback is the NPC-side twin of this work).
