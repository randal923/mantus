# Feature 48 — completed sub-work

Player-trade parity completions, from
[implementation-feature-48.md](../implementation-feature-48.md). The feature
stays **open** for ground-item offers and the restriction predicates.

Cross-links: [implementation-feature-48.md](../implementation-feature-48.md) ·
[todo-12.md](../todo-12.md).

---

## 2026-07-25 — Orphan reservations fall back to the inbox

**Problem.** When a cancelled trade's item could not be restored — the owner's
backpack full, 100 staged items, whatever — it stayed on `trade-reservation`
and **trading stayed blocked** for that character until a login recovery
happened to find carried space. A player could get permanently stuck by
filling their own backpack.

**What changed.**

- `TradeStore.restoreToInbox(characterId, itemId)` plus its Pg and memory
  implementations. One SERIALIZABLE transaction: lock the character, ensure
  their storage state, lock the item, verify it is *still* on
  `trade-reservation` and theirs, check inbox capacity, take the first free
  inbox slot, then move the row with a single guarded UPDATE and append the
  `item-transferred` audit.
- The move keeps the row's identity, so nested contents follow it untouched —
  no copy-then-delete window (charter rule 2). The `location_type =
  'trade-reservation'` predicate in the UPDATE is what makes a replay a no-op:
  recovery running twice restores once, and the second call reports
  `not-reserved`.
- `TradeService.recoverOrphans` now calls it when `planTradeRestore` finds no
  carried slot. Trading stays blocked until the delivery commits, and a
  restored item is injected into the owner's live inbox cache through
  `DepotService.injectDelivery` so it appears without a relogin. An inbox that
  is *also* full logs and keeps the old retry-at-next-login behaviour — there
  is genuinely nowhere left to put it.

**Files touched.** `server/src/trade/{TradeStore,PgTradeStore,MemoryTradeStore,TradeService}.ts`,
`server/src/trade/sql/restoreReservationToInboxQuery.ts` (new),
`server/src/GameServer.ts`.

**Verification.** `PgTradeStore.integration.test.ts` (7 passing): a reserved
container restores into the inbox with its nested contents still attached to
it, a replay reports `not-reserved` and moves nothing, and exactly one audit
row is written. `TradeService.test.ts` (11 passing): with a full backpack the
orphan lands in the inbox, and replaying recovery neither bumps its version
nor duplicates it. Full suite: `vitest run` 962 passed.

**Not done here.** Ground-item trade offers were scoped out of this pass — see
[implementation-feature-48.md](../implementation-feature-48.md) for the plan
that remains.
