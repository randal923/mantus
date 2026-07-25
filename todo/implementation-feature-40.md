# Feature 40 — Dialogue-graph engine completion

Part of [Todo 11 — NPCs, dialogue, and travel](todo-11.md).

The typed graph model (conditions, effects, focus rules), execution-time
re-validation, and the parity fixture shipped 2026-07-25 — see
[completed log](completed/implementation-feature-40-completed.md). This file
tracks only what is still open.

## Why
Parity means every pinned dialogue branch is representable and re-checked at
the moment it executes. The engine now does that for the branches whose
requirements it can express; the remaining condition kinds need their own
evaluation surfaces.

## Remaining work
- **Condition kinds beyond storage/level/premium.** Canary gates branches on
  blessings, carried item counts, health, and money (carried + bank). Each
  needs a typed condition, an evaluation path that reads live state inside the
  tick, and an importer translation. Counts and shapes are enumerated in
  [implementation-feature-38.md](implementation-feature-38.md).
- **Quest-requirement conditions** proper — the storage condition kind is the
  data layer, but the quest platform (Feature 103) owns the semantics and the
  key namespace.
- **Effects beyond `set-storage`** — item grants and removals as part of a
  dialogue branch, which must run in the same transaction as any money leg.
- **Delayed speech and dynamic profession/quest greetings** — Canary composes
  some greetings at runtime; the 21 composed messages are owned by the import
  report (Feature 38).
- **Multi-destination travel offers** so a `kick`/`travel` whose Canary
  destination is a table can be represented with a server-rolled choice.

## Implementation
- Extend `DialogueCondition` in `server/src/npc/DialogueGraph.ts` and its
  evaluation in `server/src/npc/evaluateDialogueConditions.ts`; every new kind
  is evaluated at node-execution time, never at offer time (charter rule 4).
- Extend `translateCondition` / `translateEffects` in
  `tools/parseCanaryNpcDialogues.mjs` in lockstep, and lower the parity
  ceilings.
- Preserve the shipped conversation invariants: opaque server-issued
  conversation ids, explicit offered choices, private delivery, server-clock
  timeouts, cleanup on logout/death/removal, wandering paused during
  conversation, and unfocused branches that open no conversation at all.

## Tests
- `server/src/npc/dialogueGraphParity.test.ts` must keep passing with each new
  kind added to its executable-path lists.
- `server/src/npc/loadNpcDialogueGraphsFailClosed.test.ts` gets one injected
  defect case per new condition/effect kind.
- Condition nodes re-evaluated at execution: state changed between choice offer
  and confirmation must reject.

## Dependencies
- Feature 38 (command vocabulary) — shares the translator and the parity gate.
- Feature 103 (quest platform) for quest-requirement semantics.
- Feature 72 (blessings) for blessing conditions.
