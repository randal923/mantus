# Feature 44 — completed

Currency conservation metrics and reconciliation, from
[implementation-feature-44.md](../implementation-feature-44.md).

Cross-links: [implementation-feature-44.md](../implementation-feature-44.md) ·
[implementation-feature-99.md](../implementation-feature-99.md) (db
audit/recovery — shares this job shape) · [todo-12.md](../todo-12.md).

---

## 2026-07-25 — Read-only money-supply sweep

**Problem.** Nothing checked at runtime that gold stayed conserved. Per-feature
exploit tests cover the dupes we already know about; an undiscovered one had no
standing defense, and the audit-log coupling every economy transaction pays for
was never actually read back.

**The invariant, decomposed.** Money lives in three pots, and moving between
them mints and burns coins — a deposit destroys coin rows and credits a
balance — so a single "total is constant" check would be wrong. The sweep
checks each pot with its own exact invariant:

- **Coins.** `Δcoins == minted − burned`, where both sides come from
  `audit_log` `item-created`/`item-destroyed` rows for the three coin types.
  `item-split`/`item-merged` move coins between rows without changing the
  supply and are excluded. This holds across *every* flow, including the coin
  legs of bank deposits and withdrawals.
- **Bank.** Two checks. Each account's `balance` must equal the `balance_after`
  of its most recent `bank_ledger` row (catches a balance that moved with no
  entry). And each ledger row's balance step must equal the amount it records
  (catches a forged or mis-signed row that kept the head consistent). The step
  check compares magnitudes, deliberately sign-agnostic: the entry-type list
  grows with every economy feature and this query should not have to track
  each type's direction.
- **Escrow.** Reported for operators but not re-derived: `market_offers` has a
  DB constraint pinning `escrow_balance` to `remaining_amount × unit_price`,
  so it is already structurally conserved.

Plus **orphan detection**: coin rows created since the sweep started watching
that have no `audit_log` entry at all. Bounded to rows newer than the previous
sweep and excluding `seed_key` rows, so world-seeded and pre-audit rows cannot
false-positive — the sweep only judges what it has been watching.

**What was built.**

- `server/src/economy/CurrencyReconciler.ts` — runs the sweep, holds the
  previous coin total and the previous *database* clock reading. The window is
  measured on the DB clock, not the host's, so skew cannot push audited flow
  outside the interval it is compared against.
- `server/src/economy/CurrencyConservationRunner.ts` — schedules it every five
  minutes off-tick, never overlapping itself, keeping the last report readable
  for operator tooling and logging an alert when `balanced` is false.
- `server/src/economy/CurrencyConservationReport.ts` — the report shape.
- Four parameterized, bounded queries under `server/src/economy/sql/`:
  `currencySupplyQuery`, `currencyAuditFlowQuery`, `bankLedgerDriftQuery`,
  `bankLedgerBreakQuery`, `orphanCoinRowsQuery`.
- `GameServer` ticks and stops it; `index.ts` constructs the reconciler from
  the pool. It is an optional dep, so memory-only runs and tests skip it.

The sweep is strictly read-only — a real drift is repaired through ordinary
audited transactions, never by hand (charter rule 12).

**Files touched.** `server/src/economy/{CurrencyReconciler,CurrencyConservationRunner,CurrencyConservationReport}.ts`
(new), `server/src/economy/sql/{currencySupplyQuery,currencyAuditFlowQuery,bankLedgerDriftQuery,bankLedgerBreakQuery,orphanCoinRowsQuery}.ts`
(new), `server/src/GameServer.ts`, `server/src/index.ts`,
`server/package.json`.

**Verification.** `CurrencyReconciler.integration.test.ts` — six cases: the
baseline sweep reports all three pots and no delta; a seeded run of *real*
economy mutations (deposit 60, withdraw 30, sell an axe) reconciles to zero
unexplained coin delta with `minted − burned == −23`; gold inserted straight
into `items` is flagged both as an unexplained delta and as an orphan row; a
bank balance moved behind the ledger's back is flagged as drift while the coin
pot stays clean; a forged ledger row that keeps the head consistent but whose
amount does not match its step is caught by the chain check; and two
consecutive sweeps leave item count, audit count and total balance byte-identical.
`yarn workspace server test:integration` — 193 passed.

**Residual risk.** Escrow is reported, not re-derived; it relies on the
`market_offers` DB constraint. If escrow ever stops being a pure function of
`remaining_amount × unit_price`, this sweep needs a fourth invariant.
