# Feature 47 — completed

Depot/market transaction hardening, from
[implementation-feature-47.md](../implementation-feature-47.md).

Cross-links: [implementation-feature-47.md](../implementation-feature-47.md) ·
[implementation-feature-31.md](../implementation-feature-31.md) (retry
consolidation) · [todo-12.md](../todo-12.md).

---

## 2026-07-25 — Persist-failure live resync

**Problem.** A failed memory-first persist poisoned the character's write lane
and then *disconnected* the player so the next login would reload authoritative
state. That is correct but user-hostile: one transient DB hiccup on a depot or
carried-item write kicked the player out of the world.

The other half of this feature — the missing SQLSTATE `40001` retry in the
depot/economy/market transaction lanes — had already been closed by
[Feature 31](implementation-feature-31-completed.md), which deleted
`depot/runSerializableTransaction.ts` outright and routed every depot, market
and economy op through `economy/runSerializableTransaction` (5 attempts,
growing backoff, fresh connection and transaction per attempt). Nothing further
was needed there.

**What changed.**

- `server/src/item/PersistResyncRunner.ts` (new) — rebuilds a poisoned
  character's carried inventory and depot/inbox/stash caches from committed DB
  rows, in place. The reload is issued through
  `ItemIntentHandler.runOrderedInternalOperation`, so its reads run *after*
  every write enqueued before the failure has been applied or skipped. Results
  are applied from an outcome queue inside the tick, never from the promise
  callback (charter rule 5).
- `server/src/item/ItemIntentHandler.ts` — new `setPersistResync` seam. Both
  failure paths (`enqueuePersist` and the potion persist lane) now hand the
  session to the resync instead of calling `session.terminate()`. With no
  resync wired the old disconnect behaviour is kept, which is what
  `ItemIntentHandler.sync.test.ts` still pins.
- `server/src/depot/DepotService.ts` — `closeStorageView(session)` drops an
  open depot/mailbox view after a resync (`depot-action-failed: stale`) so the
  client discards the page it was showing and re-opens against rebuilt state.
- `server/src/GameServer.ts` — constructs the runner, wires the seam, drains
  its outcomes in the tick and in `finishStop`.

**Why it is dupe-safe.** The character stays poisoned for the whole reload, so
every queued *and* newly enqueued write for them is skipped: nothing can commit
the diverged memory. `DepotService.load` re-enters the `beginLoad` buffer
window, so external deliveries (mail, rewards, expiry returns) that commit
during the reload are buffered and replayed on `attach` — id-keyed, so a
delivery the reload already saw is a no-op. Intents accepted during the window
are therefore **lost, never duplicated**: the database never saw them, and the
reload replaces memory wholesale. Conservation is preserved by construction.

Two guards matter and are tested:
- The reload is not registered as a pending character operation. `items.load`
  awaits that same key, so tracking it there self-deadlocks.
- Before attaching, the runner re-checks `registry.sessionFor(characterId)`.
  A player who logged out or relogged mid-reload has newer caches (or none),
  and a stale reload must not clobber them.

**Files touched.** `server/src/item/PersistResyncRunner.ts` (new),
`server/src/item/PersistResyncRunner.test.ts` (new),
`server/src/item/ItemIntentHandler.ts`, `server/src/depot/DepotService.ts`,
`server/src/GameServer.ts`.

**Verification.** `server/src/item/PersistResyncRunner.test.ts` — four cases:
committed DB state replaces the diverged memory (the unpersisted move is gone
and not duplicated) without disconnecting; the character stays poisoned until
the reload lands; a failing reload still disconnects; a reload that resolves
after the session stopped being the live one does not overwrite caches.
`yarn workspace server vitest run src/item src/depot` — 156 passed.

**Residual risk.** If the database is still unreachable when the reload runs,
the session is disconnected exactly as before — the resync degrades to the old
behaviour rather than looping.
