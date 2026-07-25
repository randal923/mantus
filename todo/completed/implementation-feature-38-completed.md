# Feature 38 — completed sub-work

Typed commands for procedural NPC behavior, from
[implementation-feature-38.md](../implementation-feature-38.md). The feature
stays **open**: reaching zero needs Feature 72 (blessings) and Feature 103
(quest platform), which own the remaining gap classes.

Cross-links: [implementation-feature-38.md](../implementation-feature-38.md) ·
[implementation-feature-40.md](../implementation-feature-40.md) ·
[todo-11.md](../todo-11.md).

---

## 2026-07-25 — Six command families landed; the gap count fell 2,307 → 611

**Problem.** 2,307 procedural keyword actions across 494 definitions were
imported as report entries only. `StdModule.learnSpell` alone was 1,809 of
them, and there was no server-side notion of a purchased spell.

**What changed.**

- `server/src/npc/DialogueGraph.ts` — the action union grew `learn-spell`,
  `teleport` (Canary `StdModule.kick`, modelled as a free travel offer so it
  goes through the same destination checks), and `hint`; nodes gained
  `conditions`, `effects`, `ungreet`, and `focus`.
- `server/src/npc/loadNpcDialogueGraphs.ts` — parses and validates all of it,
  including resolving every `learn-spell` id against the pinned spell catalog
  at load, and now takes an optional content-file list so fail-closed tests can
  inject defects.
- `server/src/npc/SpellTeacherStore.ts`, `PgSpellTeacherStore.ts`,
  `SpellTeacherService.ts` (new) — buying a spell mirrors the shipped promotion
  path: one SERIALIZABLE transaction re-reads the character under a row lock,
  re-checks level and prior ownership from database truth, pays carried coins
  before bank funds, records the grant, bumps the character version, and writes
  both the `bank_ledger` row and the `audit_log` row. Migration
  `040_spell_purchase.sql` adds the two event types.
- `server/src/npc/NpcDialogueExecutor.ts` — executes the new actions and
  re-evaluates every node condition at execution time before doing anything.
- `tools/parseCanaryNpcDialogues.mjs` — translates `StdModule.say` (including
  `ungreet`, `onlyUnfocus`, and literal `|TRAVELCOST|`), `learnSpell`,
  `travel`, `kick`, `promotePlayer`, and `rookgaardHints`, plus the condition
  and effect callbacks that are pure `getStorageValue` / `setStorageValue`
  shapes. Anything else is still reported, never guessed.
- Promotion actions now come from the pinned sources, so the hard-coded
  `withPromotionActions.ts` composition was deleted.

**Files touched.** `server/src/npc/{DialogueGraph,loadNpcDialogueGraphs,NpcDialogueExecutor,NpcDialogueFlow,NpcHandler,matchNpcDialogueNode,evaluateDialogueConditions,SpellTeacherStore,PgSpellTeacherStore,SpellTeacherService}.ts`,
`server/src/{GameServer,index}.ts`, `server/db/migrations/040_spell_purchase.sql`,
`tools/{parseCanaryNpcDialogues,importCanaryNpcs}.mjs`,
`content/npcs/canary-dialogue-baseline.json`, `content/npcs/canary-npc-import-report.json`,
`content/source-manifest.json` (pins `data/npclib/npc_system/custom_modules.lua`).

**Result.** Reported procedural keyword actions: **2,307 → 611**. Imported
typed actions now include 1,628 `learn-spell`, 284 `shop`, 23 `bank`, 15
`hint`, 14 `travel`/`teleport`, and 5 `promote`. Static dialogue nodes rose
from 6,745 to 8,565.

**How it was verified.** `server/src/npc/NpcTypedCommands.test.ts` (spell
purchase issues exactly one store commit with the server's own price and grants
in memory; a second purchase of a known spell never reaches the store;
a storage condition re-checked at execution rejects after the state changed;
hint counter advances and wraps; `ungreet` drops focus), plus two new
`tools/parseCanaryNpcDialogues.test.mjs` cases covering every family and every
"report rather than guess" path. Full server suite green.

**Residual risk / what is left.** Of the 611 remaining: 266 condition callbacks
and 50 effect callbacks in shapes outside the typed grammar (`hasBlessing`,
`getItemCount`, `getHealth`, money checks, item grants), 181 source-invalid
spell offers naming spells outside the pinned catalog (explicit exclusions),
27 `StdModule.bless` (Feature 72), 24 `kick` and 6 `travel` whose destination
is a Lua table or expression, and ~13 one-off quest/wedding handlers (Feature
103). The gap ceiling is pinned by `npcImportParityGate.test.ts`.
