# Feature 64 — completed

House polish (rent letters, mob blocking, eviction edges), from
[implementation-feature-64.md](../implementation-feature-64.md).

Cross-links: [todo-15.md](../todo-15.md).

---

## 2026-07-25 — Rent letters, mob blocking, and in-flight-persist ordering

**Problem.** Rent warnings were plain server messages, monsters and NPCs could
wander into houses, and the eviction sweep could race a world item whose tile
persist was still in flight.

**What changed.**

*Rent letters.* `deliverHouseLetter` mails Canary's stamped letter (item 3506,
`ITEM_LETTER_STAMPED`) into the owner's inbox **inside the rent transaction**,
under the same idempotent `inbox_deliveries` key every other inbox delivery
uses. The key carries the tenancy and the warning number, so a replayed charge
or a retried transaction can never mail the same warning twice. A full inbox is
not an error — the letter is a courtesy notice and the owner still gets the
`rent-warning` event — the caller gets null and the charge stands. The text
comes from `rentWarningLetterText`, a pure formatter following the pinned
wording, and the delivered item is pushed into the online owner's inbox cache
the same tick.

*Mob blocking.* `MovementRules.houseBlocked` now refuses every non-player
creature on a house tile outright (Canary's tile flags do the same), so a
summon or a lured monster cannot follow a player inside. A creature already
standing in a house can still walk out.

*In-flight persists.* World-item persistence is memory-first: an item's tile
write can still be queued when the eviction sweep reads the tiles, and the
sweep would then miss it. Every item-moving house transaction (abandon,
transfer, rent charge) now runs through
`ItemIntentHandler.runOrderedInternalOperation`, the same write lane the queued
persists use, so it commits behind them and always reads settled rows.

**Files touched.**
`server/src/house/{deliverHouseLetter,rentWarningLetterText,HouseService,HouseStore,PgHouseStore,MemoryHouseStore}.ts`,
`server/src/world/MovementRules.ts`, `server/src/GameServer.ts`.

**How it was verified.** `HouseService.test.ts` — the eviction run mails
exactly `maxWarnings - 1` letters plus the evicted item and a replayed scan
adds nothing; a monster cannot step onto a house tile but can step off one.
`PgHouseStore.integration.test.ts` — the warning mails exactly one stamped
letter carrying its text, and it is still the only letter after the eviction
and its replay.

**Residual risk (accepted).** Inbox-overflow spillover keeps the shipped
behaviour: items that do not fit the recipient's inbox stay on the tiles and
are counted in the eviction audit row. Canary mails them with `FLAG_NOLIMIT`,
ignoring the inbox cap — matching that exactly would let an eviction push a
character's inbox past `DEPOT_LIMITS.maxInboxItems`, i.e. unbounded
per-connection storage, which charter rule 10 forbids. Recorded as a deliberate
deviation rather than implemented; revisit if operators need it.
