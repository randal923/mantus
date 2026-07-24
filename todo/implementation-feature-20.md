# Feature 20 — Exhaustive vocation coefficient fixtures

Part of [Todo 7 — Vocations, stats, and progression](todo-7.md).

**Completed 2026-07-24.** `tools/buildVocationCoefficientFixture.mjs` transcribes
the pinned Canary `vocations.xml` into
`server/src/progression/vocationCoefficientFixture.json`;
`vocationCoefficients.test.ts` deep-equals every vocation's gameplay-coefficient
subset against the fixture (drift fails) and asserts every field is classified
as gameplay or explicitly non-gameplay (a new unclassified field fails).
Delegated: PvP coefficients → Feature 60; gem/Wheel families → Features 79–82.
Full record, files touched, and verification in
[completed/implementation-feature-20-completed.md](completed/implementation-feature-20-completed.md).
