# TODO

The backlog for full parity with the pinned Canary baseline lives under
[`todo/`](todo/README.md). It was restructured 2026-07-24 from a full audit of
the previous per-area files against the codebase:

- [`todo/done.md`](todo/done.md) — everything already shipped, grouped by area.
- [`todo/todo-1.md`](todo/todo-1.md) … [`todo/todo-22.md`](todo/todo-22.md) —
  the 22 remaining areas, each listing its numbered features.
- `todo/implementation-feature-N.md` — one implementation plan per remaining
  feature (107 total): remaining work, file surface, approach, Canary
  references, and required exploit/regression tests.

Start with the [overview](todo/README.md) for the pinned upstream snapshots,
rewrite boundary, cross-cutting rules, and recommended order. Feature 1 (the
Canary parity ledger) is the cross-cutting completion contract; Feature 100
(testing and release gates) is the final pre-launch gate.

Add a newly discovered gap to the narrowest matching todo area; add it here
only when it needs a new area or changes the implementation order. Known
limitations accepted during a session are recorded in the owning feature file
(per `AGENTS.md`).
