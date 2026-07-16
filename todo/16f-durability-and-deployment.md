# Continuous durability and deployment

Part of [`16-operations-and-security`](16-operations-and-security.md). See
also the durability model in the [overview](README.md).

## Continuous durability and deployment

- [ ] Make production correctness independent of a scheduled global save,
  global map clean, or daily process restart. A server that remains online for
  weeks must persist and advance the same durable state correctly.
- [ ] Define and monitor the accepted durability window for each class of
  state: bounded asynchronous snapshots for non-economy character state, and
  immediate committed transactions before acknowledgement for economy,
  ownership, rewards, and other non-repeatable outcomes.
- [ ] Add graceful draining: stop new sessions, stop accepting new gameplay
  work, flush dirty character snapshots with a deadline, require the unsaved
  character metric to reach zero, close connections, and then stop the world
  process.
- [ ] Make startup reconstruct transient world indexes from PostgreSQL and
  versioned static content. Do not require a clean prior shutdown for
  correctness.
- [ ] Prefer online/backward-compatible migrations and rolling infrastructure
  changes. Use an explicit maintenance window only when a map, protocol, or
  incompatible migration genuinely requires one—not as a daily persistence
  mechanism.

## Required tests

- [ ] Failure-injection tests for abrupt process death between in-memory
  mutation and asynchronous snapshot persistence verify the documented
  non-economy loss window while item, gold, reward, and audit commits remain
  atomic and cannot duplicate.
- [ ] Restart tests prove durable schedules, mutable world state, and
  ownership rebuild correctly without running a global-save routine first.
- [ ] Graceful deploys reach zero unsaved characters before process stop.

[Back to overview](README.md)
