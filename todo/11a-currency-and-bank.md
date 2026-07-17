# Currency, accounting, and bank

Part of [`11-economy`](11-economy.md). Depends on atomic
[`items`](05-items-and-inventory.md) and the audit log. This unit comes first:
every other economy unit builds on its currency decisions and ledger rules.

## Currency and accounting

- [x] Match Canary's carried-money and bank behavior using project-native item
  and ledger models; define one canonical conversion path and never let client
  totals drive it. (`server/src/economy/CurrencyBalance.ts` is the canonical
  gold/platinum/crystal conversion; `planMoneySpend`/`planMoneyGrant` are the
  only conversion paths.)
- [x] Add constrained bank balances with nonnegative checks and ledger/audit
  entries committed in the same transaction as every credit/debit.
  (`bank_accounts` + `bank_ledger` in migration `012_bank.sql`,
  `PgBankStore` commits ledger + audit in the same SERIALIZABLE transaction.)
- [x] Use exact integer units only. Prices, fees, counts, and balances are
  server-owned and overflow-bounded. (`BANK_LIMITS` caps single operations at
  1e12 and balances at 1e15; every store input is integer-validated.)
- [ ] Add conservation checks/metrics for gold and tracked rares created,
  destroyed, and transferred. (A conservation exploit test exists in
  `PgBankStore.integration.test.ts`; runtime metrics/reconciliation jobs are
  still missing.)

## Planned file surface

- Migrations for bank/ledger tables.
- Server: `server/src/economy/BankService.ts`.
- Protocol/client: bank intents/projections and a focused accessible panel.

## Required exploit tests

- [x] Two purchases/spends racing on one balance cannot go negative.
- [x] Failed operations change neither money nor items.
- [x] Every balance change has its audit/ledger entry in the same transaction.
- [x] Conversion between carried gold and balance conserves total currency
  under concurrent requests.

All four live in `server/src/economy/PgBankStore.integration.test.ts`
(gated on `TEST_DATABASE_URL`, like the item-store integration suite).

## Known gaps (accepted for now)

- Banking is panel-driven (`bank-deposit`/`bank-withdraw`/`bank-transfer`
  intents opened via naji's `bank` dialogue action). Canary-style free-text
  keyword amounts ("deposit 500" in chat) and the `change gold/platinum/
  crystal` keyword flows are not implemented; the panel covers the same
  operations.
- Guild bank operations do not exist (guilds do not exist yet).
- An online transfer recipient is not notified live; they see the new balance
  the next time they open the bank. Fix: push `bank-updated` to the recipient
  session on commit.
- Canary's main-town transfer restriction (`minTownIdToBankTransferFromMain`)
  is not implemented — the world currently has one effective town.
- Withdrawn coins and deposit change land in loose `inventory` slots (matching
  NPC travel change behavior), not inside the backpack container.
- NPC travel fares still use `planNpcFarePayment` (gold+platinum only, no bank
  fallback); unify it with `planMoneySpend` when shops land so all payment
  paths share the canonical conversion.

[Back to overview](README.md)
