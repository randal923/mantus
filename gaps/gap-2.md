# Gap 2: `drainDue` spreads an unbounded array into `push()` — latent crash

**Severity:** medium (correctness under load)
**Verified:** 2026-08-05, `server/src/drainDue.ts`

## Evidence

```ts
queue.length = 0;
queue.push(...remaining);
```

Spreading `remaining` into arguments overflows the engine's argument limit
(~65k in V8) once a scheduled queue (Combat, MonsterEventService — both drain
through this helper) grows past it: `RangeError: Maximum call stack size
exceeded` in the middle of a tick. Also allocates two full arrays per drain
even when 1 of 5,000 entries is due.

## Recommended fix

Compact in place with a write cursor (keeps the same-array-instance contract
that lets handlers enqueue during processing), and track an `earliestExecuteAt`
watermark for an allocation-free early return when nothing is due. Regression
test: drain a queue of 200k entries without throwing.
