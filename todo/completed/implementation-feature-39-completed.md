# Feature 39 — completed

NPC import validation and parity reports, from
[implementation-feature-39.md](../implementation-feature-39.md).

Cross-links: [implementation-feature-39.md](../implementation-feature-39.md) ·
[implementation-feature-38.md](../implementation-feature-38.md) ·
[todo-11.md](../todo-11.md).

---

## 2026-07-25 — Import-time validation, whole-world destination proof, parity gate

**Problem.** Several validations ran only live at execution time, the
whole-world unavailable-destination report did not exist (walkability was
checked against a ten-destination fixture), and no test forced the parity
report's counts to shrink.

**What changed.**

- `tools/readMapNavigation.mjs` (new) — the TMAP present/walkable reader,
  extracted from `importCanaryCreatures.mjs` so any importer can prove a
  position statically. Adds `hasWalkableWithin(position, radius)`, matching the
  server's "land on the nearest free tile within 2" rule.
- `tools/importCanaryNpcs.mjs` — validates **before** writing any content:
  every travel and diversion destination is proven reachable on the converted
  map; every dialogue names a definition the creature import resolved; no
  duplicate dialogue, node, or offer id; every node/offer reference resolves;
  every shop catalog belongs to exactly one resolved NPC. The report gained a
  `destinations: { checked, unavailable }` block. The pinned
  `custom_modules.lua` hash is checked before its hint table is read.
- Definition selection now reads the creature report's `definitions` index
  instead of "whatever is still unsupported", so closing creature-side gaps no
  longer breaks the NPC import.

**Files touched.** `tools/readMapNavigation.mjs`, `tools/importCanaryNpcs.mjs`,
`tools/importCanaryCreatures.mjs`, `tools/parseCanaryNpcDialogues.mjs`,
`tools/parseCanaryNpcDialogues.test.mjs`, `content/npcs/canary-npc-import-report.json`,
`content/source-manifest.json`.

**How it was verified.** `server/src/npc/npcImportParityGate.test.ts` (new):
gap counts at or below pinned ceilings, all 956 definitions accounted for with
every unselected source classified, zero unavailable destinations with a
non-zero checked count, source-invalid exclusions (Black Bert's three shop rows
and the 181 out-of-catalog spell offers) asserted as explicit entries with
reasons, and every reported definition resolving against loaded content.
`server/src/npc/loadNpcDialogueGraphsFailClosed.test.ts` (new) covers 13
injected defect classes at the loader. `tools/parseCanaryNpcDialogues.test.mjs`
covers the importer's report-rather-than-guess paths.

**Residual risk.** The gate asserts non-increase, not zero, because the
remaining gaps are owned by Feature 72 and Feature 103. Lower the ceilings in
`npcImportParityGate.test.ts` as each family lands.
