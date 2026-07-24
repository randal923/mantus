# Feature 9 — completed sub-work

Feature 9 (creature importer typed-data completeness) has its main body — turning
the remaining ignored gameplay assignments into typed data — **blocked** by the
importer's own design: `creatureGapOwner` in `tools/importCanaryCreatures.mjs`
classifies every remaining ignored assignment as `status: blocked`, owned by a
later feature (Todo 11 NPC behavior/shops via `10-npcs` / `11b-npc-shops`, and
Todo 16 bestiary/bosstiary/forge via `15-optional-features`). Those owner-todos
must define the target representation before the fields can be typed, so Feature
9 stays **open**. This file records the self-contained guard work already
finished, moved out of [implementation-feature-9.md](../implementation-feature-9.md).

Cross-links: [implementation-feature-9.md](../implementation-feature-9.md) ·
[todo-5.md](../todo-5.md).

---

## 2026-07-24 — Ignored-assignment gap-surface guard + typed-scalar round-trip

**Problem.** The world import report lists the gameplay assignments and
procedural callbacks the importer parsed but did not type (911 monster + 956 NPC
`unsupportedDefinitions`; 4,926 ignored assignments; 6,518 procedural
callbacks). Nothing pinned that surface, so a converter/content change could
silently *add* a new ignored field — a previously-typed behavior regressing into
"silently ignored", the exact hole this feature exists to close. Feature 9's own
Tests call for a "report assertion test: importing with a newly ignored gameplay
assignment fails the … run."

**What changed.**

- Confirmed the importer is deterministic: re-running
  `node tools/importCanaryCreatures.mjs /home/randal/code/canary` (pinned commit
  `a879c931…`) reproduces the committed content byte-for-byte (zero git diff).
- `server/src/spawn/creatureImportReport.test.ts` (new) — reads the committed
  `content/spawns/world-import-report.json` and asserts:
  - every `unsupportedDefinitions` kind is monster or npc;
  - every ignored assignment name is in a pinned per-kind allowlist (a new field
    name fails);
  - every procedural callback is in a pinned allowlist (a new callback fails);
  - every gap is `status: blocked` and owned by a delegated feature
    (`10-npcs`, `11b-npc-shops`, `15-optional-features`) — the importer's
    default owner `04-creatures-spawns-and-ai` is deliberately excluded, so a gap
    nobody has been assigned to type fails;
  - the definition/ignored/callback counts stay at or below pinned ceilings
    (1867 / 4926 / 6518), so the surface can only shrink.
- `server/src/spawn/loadCreatureContent.test.ts` — added a round-trip test for
  Feature 9's "already typed" scalar set (static mana cost, light, target-change
  rules, hidden health, static-attack chance): every monster carries the typed
  shape and at least one carries a real non-default value for each.

**Files touched.** `server/src/spawn/creatureImportReport.test.ts` (new),
`server/src/spawn/loadCreatureContent.test.ts`.

**Verification.** `yarn workspace server test run
src/spawn/creatureImportReport.test.ts src/spawn/loadCreatureContent.test.ts`
→ 9 passed. `yarn workspace server typecheck` clean.

**Residual risk / remaining work (keeps the feature open).** The 4,926 ignored
assignments and 6,518 callbacks are still untyped. Typing them (raceId,
Bestiary/bosstiary metadata, reward-boss/prey flags on monsters; speechBubble,
flags, voices, shop, currency and the NPC callbacks) is gated on the delegated
owners — Todo 11 (Features 37–42, NPC behavior/shops) and Todo 16 (Features
77–78, bestiary/bosstiary/forge) — defining the target representation. As each
owner-todo lands, extend `MonsterType`/`NpcType` + the importers to capture the
now-supported fields, prune this test's allowlists, and lower its ceilings.
Feature 10's aggregate parity gate builds on this same report.
