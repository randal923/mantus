# Feature 38 — Typed commands for procedural NPC behavior

Part of [Todo 11 — NPCs, dialogue, and travel](todo-11.md).

Six command families shipped 2026-07-25 and took the reported gap count from
2,307 to 611 — see
[completed log](completed/implementation-feature-38-completed.md) for what
landed, how it was verified, and the full residual breakdown. This file tracks
only what is still open.

## Why
This is the core parity grind: every procedural gap in the NPC import must
become a reviewed, typed TypeScript command until the import report reaches
zero. There will be no general Lua evaluator — ever.

## Remaining work
- **316 callback branches outside the typed grammar.** 266 condition callbacks
  and 50 effect callbacks whose bodies are not pure `getStorageValue` /
  `setStorageValue`. By shape: `hasBlessing(n)` (116, blocked on Feature 72),
  `getHealth() < n` (29), `getMoney() + getBankBalance() >= n` (22),
  `getItemById`/`getItemCount` (31), multi-clause conjunctions mixing storage
  with item counts (35), and item-granting effect bodies. Each needs its own
  typed condition/effect kind plus an execution-time evaluation surface.
- **27 `StdModule.bless`** — blocked on Feature 72 (blessing purchase,
  persistence, consumption).
- **30 `travel`/`kick` calls whose destination is a Lua table or expression**
  (Canary picks one at random from a table, or computes it). Needs a
  multi-destination offer shape with server-rolled selection.
- **~13 one-off handlers** — `townTravelHandler`, `donationHandler`, the
  wedding handlers, Wayfarer/dream quest steps. Blocked on Feature 103.
- **21 dynamically composed messages** and the remaining reported
  `proceduralCallbacks`.
- **181 source-invalid spell offers** naming spells outside the pinned catalog
  stay explicit exclusions in the report, not silent omissions — as do Black
  Bert's three shop rows. Do not "fix" these by loosening the resolution.

## Implementation
- Grow the action vocabulary in `server/src/npc/NpcDialogueExecutor.ts` /
  `server/src/npc/DialogueGraph.ts`, following the shipped families there and
  the `withBoatTravelRoutes.ts` composition pattern.
- Extend the typed condition grammar in
  `server/src/npc/evaluateDialogueConditions.ts` and the matching translator in
  `tools/parseCanaryNpcDialogues.mjs` (`translateCondition` / `translateEffects`).
- Reviewed content lives in `content/npcs/canary-dialogues.json`, overriding
  the generated baseline.
- Every new action re-validates at execution time inside the tick
  (range/floor/state/money/items), never at enqueue (charter rule 4).
  Money-touching actions run as one ACID transaction with audit entries
  (charter rules 2/11), following `PgSpellTeacherStore.ts` / `PgPromotionStore.ts`.
- Canary reference: the selected definitions' Lua callbacks in
  opentibiabr/canary are the source of truth for each command's semantics.

## Tests
- Per-command-family tests in the `NpcTypedCommands.test.ts` style: forged
  action ids rejected, execution-time re-checks enforced, money legs atomic.
- Lower the ceilings in `server/src/npc/npcImportParityGate.test.ts` with every
  landed family; they may never rise.

## Dependencies
- Feature 103 (quest platform) for quest-hook commands and storage gates.
- Feature 72 (blessings) for blessing commands and `hasBlessing` conditions.
- Feature 46 (shop completions) for the remaining money actions.
- Feature 40 (graph engine) hosts the conditions.
