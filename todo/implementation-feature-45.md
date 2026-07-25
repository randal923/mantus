# Feature 45 — Bank parity and UX gaps

Part of [Todo 12 — Economy: shops, banking, depot, trade, and market](todo-12.md).

The live recipient push, the `deposit`/`withdraw` free-text keywords, the
nested-bag withdrawal precheck and the helper dedup shipped 2026-07-25 — see
the [completed log](completed/implementation-feature-45-completed.md). This
file tracks only what is still open.

## Remaining work

- **`change gold` / `change platinum` conversions.** Canary lets a banker
  convert carried denominations ("change 100 gold" → 1 platinum, and back).
  This touches no bank balance at all — it is a pure carried-coin transform —
  so it needs its own store operation rather than reusing deposit/withdraw:
  a `BankStore.changeMoney` running `destroyItems` + `grantStackable` for the
  two denominations in one SERIALIZABLE transaction, with an `audit_log` row
  recording both legs. The dialogue side is a third branch in
  `server/src/npc/withBankKeywords.ts` plus a `bank-keyword` operation value;
  the amount parser already exists. Conservation test: carried worth before ==
  carried worth after.
- **Guild bank.** Needs guild-owned balances and an authorization model on top
  of the shipped guild ranks.
- **`minTownIdToBankTransferFromMain`.** Only one effective town exists today,
  so the restriction has nothing to gate.

## Tests

- Change conversions conserve carried worth exactly, under concurrency, in one
  transaction.
- Guild-bank withdrawals are authorized against the session's own guild rank,
  never a guild id from the message body.

## Dependencies

- Guilds (Feature 58 — guild bank).
- Multi-town support (for `minTownIdToBankTransferFromMain`).
