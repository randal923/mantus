# Feature 26 — completed sub-work

Feature 26 is **still open**: the disabled count is not yet zero, and cannot be
until the features it depends on land. Cross-links:
[implementation-feature-26.md](../implementation-feature-26.md) ·
[todo-8.md](../todo-8.md) · [Feature 25 log](implementation-feature-25-completed.md).

---

## 2026-07-25 — Report classification, parity budget gate, determinism check

**Problem.** The generated spell report counted one number for everything:
`236 total / 166 supported / 70 unsupported`. Canary's `#example.lua`
documentation stub was inside the unsupported count, so "zero disabled" could
never be reached and the target was meaningless. Nothing asserted the report at
all, and nothing checked that it was actually generated from the entries it
ships with.

**What changed.**

### Report

- `tools/buildSpellReport.mjs` (new) — the report builder, extracted so it can
  be re-run against the committed catalog without a Canary checkout. Output:
  - `total` / `nonContent` / `registered` — non-content (Canary's example
    stubs, `parity.status === "non-content"`) is classified out, and every
    gated count below is computed over registered definitions only.
  - `supported`, and `disabled` broken down into `spells`, `runes` and
    `byOwner` (the owning todo for each blocked definition).
  - `ignoredFormulaFields` — declared formula inputs Canary applies and this
    importer drops. `COMBAT_FORMULA_DAMAGE` is a plain
    `normal_random(mina, maxa)` in `Combat::getMinMaxValues`, so its
    `minb`/`maxb` arguments are dead in Canary too and are not counted; any
    other formula type set directly on the combat is. **Currently 0.**
  - `unreviewedCallbacks` — registered definitions whose Lua body still has no
    reviewed TypeScript counterpart.
- `tools/parseCanarySpells.mjs` — emits per-spell `ignoredFormulaFields`.
- `tools/importCanarySpells.mjs` — delegates to the builder; the console line
  now reports registered / supported / disabled.

Current state: **236 total · 1 non-content · 235 registered · 169 supported ·
66 disabled · 0 ignored formula fields · 47 unreviewed callbacks.**

### Gate

- `server/src/combat/loadCanarySpellCatalog.test.ts` — the gate test.
  `ignoredFormulaFields` is asserted to be **0** and locked there. The counts
  that have not reached zero are pinned to an explicit per-owner budget, each
  line naming the feature that owns driving it down, so a regression fails
  loudly and this is the single place to flip to zero. `supported` is asserted
  to equal what the loader actually returns.
- `tools/buildSpellReport.test.mjs` (new) — determinism: the committed report
  must be exactly what the committed entries produce (a hand-edited or stale
  report fails), building twice is byte-identical, and non-content never
  contributes a reason to the gated counts.

**How it was verified.** `node --test tools/*.test.mjs`,
`yarn workspace server test`, `yarn typecheck`. `yarn parity:check` verifies
6326 sources / 10349 callbacks / 236 spells once the pre-existing
`tools/importTibiaAssets.mjs` hash drift recorded in `TODO.md` is set aside.

**What is left.** Driving the 66 disabled definitions to zero belongs to the
features that own them — the per-owner budget in the gate test is the work
list. See [implementation-feature-26.md](../implementation-feature-26.md).
