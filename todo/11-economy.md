# Shops, banking, depot, trade, and market

Depends on atomic [`items`](05-items-and-inventory.md), character ownership,
and the audit log. Treat every operation as concurrent by default.

Split into one-session units; implement in order (11a first — the others build
on its currency decisions and ledger rules):

1. [Currency, accounting, and bank](11a-currency-and-bank.md)
2. [NPC shops](11b-npc-shops.md)
3. [Depot and inbox](11c-depot-and-inbox.md)
4. [Player trade](11d-player-trade.md)
5. [Market](11e-market.md)

One rule spans all five: never touch more than one of these systems in a
single PR, and every commit that moves money or items carries its audit entry
in the same transaction.

[Back to overview](README.md)
