# Currency, accounting, and bank

Part of [`11-economy`](11-economy.md). Depends on atomic
[`items`](05-items-and-inventory.md) and the audit log. This unit comes first:
every other economy unit builds on its currency decisions and ledger rules.

## Currency and accounting

- [ ] Match Canary's carried-money and bank behavior using project-native item
  and ledger models; define one canonical conversion path and never let client
  totals drive it.
- [ ] Add constrained bank balances with nonnegative checks and ledger/audit
  entries committed in the same transaction as every credit/debit.
- [ ] Use exact integer units only. Prices, fees, counts, and balances are
  server-owned and overflow-bounded.
- [ ] Add conservation checks/metrics for gold and tracked rares created,
  destroyed, and transferred.

## Planned file surface

- Migrations for bank/ledger tables.
- Server: `server/src/economy/BankService.ts`.
- Protocol/client: bank intents/projections and a focused accessible panel.

## Required exploit tests

- [ ] Two purchases/spends racing on one balance cannot go negative.
- [ ] Failed operations change neither money nor items.
- [ ] Every balance change has its audit/ledger entry in the same transaction.
- [ ] Conversion between carried gold and balance conserves total currency
  under concurrent requests.

[Back to overview](README.md)
