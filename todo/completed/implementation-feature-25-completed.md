# Feature 25 — completed

Cross-links: [todo-8.md](../todo-8.md) · [Feature 26 log](implementation-feature-26-completed.md).

---

## 2026-07-25 — Custom combat areas represented as typed data

**Problem.** Player spells whose Canary area is a custom tile matrix were
either disabled or silently approximated:

- `AREA_BALANCED_BRAWL` and `AREA_RING1_BURST3` mark their centre with `2`
  (a centre cell that is deliberately *not* hit). The importer's matrix reader
  only accepted a `3` centre, so it skipped both tables entirely and three
  spells were rejected with `unsupported combat area`.
- Canary's **extended area** — the second `createCombatArea(area, extArea)`
  argument, which `AreaCombat::setupExtArea` installs for the four diagonal
  cast directions — was parsed for monster abilities but dropped for player
  spells. Nine wave/beam spells therefore rotated their cardinal matrix on a
  diagonal cast instead of swapping in the authored diagonal one.
- `AREADIAGONAL_*` tables were never read at all: the table-scanner regex was
  `AREA_[A-Z0-9_]+`, which does not match `AREADIAGONAL_`.
- Spells that build their combat inside a local helper (`createCombat(area,
  areaDiagonal, …)`) passed a lowercase parameter to `createCombatArea`, so
  the area came out as `dynamic combat area` (Great Death Beam) or was
  replaced by a hand-written cone/beam approximation (Energy Beam, Energy
  Wave, Great Energy Beam). The Energy Wave approximation was wrong: a
  13-tile cone standing in for the 11-tile `AREA_SQUAREWAVE5` matrix.

**What changed.**

### Catalog pipeline

- `tools/importCanarySpells.mjs` — `parseAreas` now reads `2` and `3` alike as
  the matrix centre (matching `AreaCombat::createArea`, where `1`/`3` mark an
  affected tile and `2`/`3` mark the centre), and scans `AREA[A-Z0-9_]*` so the
  `AREADIAGONAL_*` tables are picked up.
- `tools/parseCanarySpells.mjs`
  - `parseAreaCall` replaces the old inline `combat:setArea(` match: it finds
    the `createCombatArea(area[, extArea])` call wherever it is written, and
    captures the extended-area argument.
  - `resolveAreaArgument` resolves an area passed into a local helper by
    taking the **first** call site of that helper — the base, un-upgraded
    combat, which is what this catalog models.
  - `areaFor` emits `diagonalOffsets` from the extended table and no longer
    carries the nine hardcoded `circle`/`cone`/`beam` fallbacks. Every area
    constant the pinned spells use now resolves from the real tables, so an
    unresolvable constant fails closed instead of being approximated.
  - Reviewed overlays: `balanced-brawl` player callback, and a new
    `reviewedWheelRevelation` map for the two Twin Burst spells. The dead
    `areaConstant` overlay field was removed with its last user.
- `content/spells/canary-spells.json` regenerated from the pinned checkout
  (`a879c93`). Provenance (`canaryCommit`, `definitionsSha256`) unchanged.
  **166 → 169 supported.** Format version 2 → 3 (entries gained
  `diagonalOffsets`, `wheelRevelation`, `ignoredFormulaFields`; see the
  Feature 26 log for the report shape).

### Server

- `server/src/combat/loadCanarySpellCatalog.ts` — validates and loads
  `diagonalOffsets` (shared `parseOffsets`) and `wheelRevelation`.
- `server/src/combat/Spell.ts` — `wheelRevelation` on `SpellDefinition`;
  `balanced-brawl` added to `PLAYER_SPELL_ACTIONS`.
- `server/src/combat/SpellCaster.ts` — enforces the wheel revelation gate in
  `spellRejectionCode`, against the character's own `wheelBonuses`, at
  execution time. `executeWorldSpell` now takes the intent's target instead of
  hardcoding `{ kind: "self" }`, so a `direction` player-action spell passes
  the target check.
- `server/src/combat/PlayerSpellActions.ts` — `balancedBrawl`: re-reads the
  monsters covered by the matrix (anchored on the tile ahead of the caster,
  per the Feature 25 anchoring rule) and pulls each into melee for 16 s.
- `protocol/src/serverMessages.ts` + both locales — new `spell-not-learned`
  error code ("You need to learn this spell first.").

**Spells enabled.** Ice Burst and Terra Burst (`AREA_RING1_BURST3`, gated on
the blue-domain revelation stage 1 = Twin Bursts) and Balanced Brawl
(`AREA_BALANCED_BRAWL`, reviewed pull callback).

**Areas corrected on already-enabled spells.** Chill Out, Fire Wave, Ice Wave,
Practise Fire Wave, Scorch, Terra Wave, Great Fire Wave, Front Sweep and
Lesser Front Sweep gained their authored diagonal matrices; Energy Beam,
Energy Wave and Great Energy Beam now use the real `AREA_BEAM5` /
`AREA_SQUAREWAVE5` / `AREA_BEAM8` matrices (plus diagonals) instead of
approximations.

**How it was verified.**

- `tools/parseCanarySpells.test.mjs` — matrix + extended-matrix import, helper
  indirection resolving to the base call site, and fail-closed on an
  unresolvable constant.
- `server/src/combat/areaPositions.test.ts` — cardinal rotation vs. diagonal
  matrix swap against the pinned `AREA_BEAM5`/`AREADIAGONAL_BEAM5` pair, and a
  `2`-centre matrix leaving its own tile out of the affected set.
- `server/src/combat/loadCanarySpellCatalog.test.ts` — the three previously
  disabled matrix spells load with the exact pinned affected-tile sets.
- `server/src/combat/Combat.test.ts` — the wheel gate refuses the cast and
  spends nothing until the revelation stage is reached, and Balanced Brawl
  pulls only the monsters its matrix covers (never the tile behind the
  caster).
- `yarn typecheck`, `yarn workspace server test`, `yarn workspace client test`,
  `node --test tools/*.test.mjs` all pass. `yarn parity:check` passes for every
  converter except the pre-existing `tools/importTibiaAssets.mjs` hash drift
  recorded in `TODO.md`.

**Residual risk.** Wheel-upgraded (WOD) area grades are modelled at their base
grade only — see the recorded gap in `TODO.md`.
