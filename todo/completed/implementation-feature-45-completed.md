# Feature 45 — completed sub-work

Bank parity and UX gaps, from
[implementation-feature-45.md](../implementation-feature-45.md). The feature
stays **open** for the guild bank (needs Feature 58), the multi-town transfer
restriction, and the `change gold` coin-conversion keyword.

Cross-links: [implementation-feature-45.md](../implementation-feature-45.md) ·
[implementation-feature-46.md](../implementation-feature-46.md) (backpack
destination planning) · [implementation-feature-42.md](../implementation-feature-42.md)
· [todo-12.md](../todo-12.md).

---

## 2026-07-25 — Live recipient push, keyword deposits/withdrawals, helper dedup

### 1. An online recipient learns of a transfer immediately

`executeBankTransfer` now returns the recipient's post-commit balance
(`toBalance`) alongside the sender's, and `BankService` pushes `bank-updated`
to the recipient's live session after the commit outcome applies inside the
tick. The push carries **their balance and nothing else** — no sender name, no
amount, no ledger row (charter rule 6) — which is what its test asserts by
comparing the recipient's entire received-message list. An offline recipient is
simply not pushed to; the balance is already committed either way.

`BankService` now takes the `SessionRegistry`. This is the same push mechanism
[Feature 49](../implementation-feature-49.md) wants for market counterparties.

### 2. Canary's free-text money keywords

"deposit 500" / "withdraw 100" typed at a banker now work.

- `DialogueAction` gained `{ kind: "bank-keyword", operation }`.
- `server/src/npc/withBankKeywords.ts` (new) composes the two branches onto
  every graph that already has a `bank` action — the same decorator shape as
  `withBoatTravelRoutes`, because the importer drops these handlers (their
  amount is a runtime capture, not content). The branches are reachable by
  typing only, never as a clickable choice: a click has no line to read an
  amount out of.
- `NpcHandler` passes the player's own line into `executeNode`, and
  `server/src/npc/parseBankKeywordAmount.ts` (new) extracts the amount. That
  text is untrusted: only a plain in-range integer is accepted — no
  separators, no signs, no exponents, and digit runs longer than the balance
  cap are rejected before `Number` can lose precision.
- `BankService.handle` and the new `handleKeyword` were refactored onto one
  private `run(...)`, so the keyword path goes through the **identical**
  banker check, talk-range check, busy check, in-memory precheck and store
  transaction as the panel. Only the reply surface differs: the NPC speaks the
  outcome instead of the bank protocol answering.

This is parity, not capability — every limit and the one-SERIALIZABLE-
transaction ledger + `audit_log` coupling are untouched.

### 3. Withdrawal prechecks see nested bags

`server/src/economy/countFreeBackpackSlots.ts` (new) counts free slots across
the equipped backpack *and* the containers nested inside it (depth ≤ 8) — the
same destinations `BackpackSlotLocker` locks inside the transaction after
[Feature 46](implementation-feature-46-completed.md). Without this the tick
precheck rejected withdrawals with `no-space` that the transaction would have
happily placed in a carried bag.

The "withdrawn coins land in loose `inventory` slots" item was already resolved
by migration 032 (loose inventory removed); withdrawals have gone into the
backpack since.

### 4. Helper dedup

`BankService`'s private `COIN_STACK_LIMIT`, `countCarried` and `inTalkRange`
were replaced by the shared `coinStackLimit.ts`, `countCarriedCoins.ts` and
`inNpcTalkRange.ts`. Behaviour is guarded by `BankService.test.ts`.

**Files touched.** `server/src/economy/{BankService,BankOperationResult,executeBankTransfer}.ts`,
`server/src/economy/countFreeBackpackSlots.ts` (new),
`server/src/npc/{DialogueGraph,NpcDialogueExecutor,NpcHandler,loadNpcDialogueGraphs}.ts`,
`server/src/npc/{withBankKeywords,parseBankKeywordAmount}.ts` (new),
`server/src/GameServer.ts`, `server/src/npc/dialogueGraphParity.test.ts`
(`bank-keyword` added to the executable-action list).

**Verification.** `BankService.test.ts` (15 passing) gains: the recipient push
contains only their own balance; an offline recipient does not break the
commit; a keyword deposit runs the panel's exact validation and answers through
the NPC rather than the bank protocol; an oversized keyword deposit is rejected
as `insufficient-funds` before reaching the store; a keyword deposit out of
talk range is rejected. `parseBankKeywordAmount.test.ts` covers separators,
exponents, zero/negative, and the balance cap. Full suite: `vitest run` 950
passed; `test:integration` 183 passed.
