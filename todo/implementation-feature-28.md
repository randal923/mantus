# Feature 28 — Spell-words-via-chat completion

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

**Completed 2026-07-25.** All five recorded gaps are closed: name-parameterized
casts resolve to a visible player and re-check visibility at execution time,
successful casts broadcast in the new server-authored `magic` speech mode,
yelled spell words cast without spending the yell exhaust, exani hur is
bindable to an action-bar slot through a bounded slot `parameter`, and both
floor-moving spells ignore the walk cooldown (Canary teleports on cast) while
still spending resources only on success.

Full record, files touched, verification, and the two residual notes (the
`parameterKind` derivation, and refused words still being spoken) in
[completed/implementation-feature-28-completed.md](completed/implementation-feature-28-completed.md).
