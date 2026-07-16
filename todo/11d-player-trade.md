# Player trade

Part of [`11-economy`](11-economy.md). Depends on atomic
[`items`](05-items-and-inventory.md) and
[`11a-currency-and-bank`](11a-currency-and-bank.md). Treat every operation as
concurrent by default; write the exploit test first.

## Player trade

- [ ] Model invite, accept, offered-item reservation, both-side confirmation,
  commit, cancel, timeout, disconnect, movement/range failure, and revision
  changes as an explicit state machine.
- [ ] Reserve each offered item against other moves without yielding in the
  middle of shared-state mutation. Revalidate item ancestry/contents and both
  players immediately before commit.
- [ ] Transfer both item legs in one transaction and append the audit record in
  that transaction; then publish committed state.

## Planned file surface

- Migrations for trade/audit metadata (the `trade-reservation` item location
  already exists in the schema).
- Server: `server/src/trade/TradeSession.ts`, `TradeService.ts`.
- Protocol/client: trade intents/projections and a focused accessible panel.

## Required exploit tests

- [ ] The same item cannot be moved while reserved in trade.
- [ ] Simultaneous trade accept/cancel/disconnect leaves every item with one
  owner and both currency legs conserved.
- [ ] Two intents racing for the same offered item leave exactly one item.
- [ ] Every trade commit has its audit entry in the same transaction.

[Back to overview](README.md)
