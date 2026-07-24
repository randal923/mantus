# Feature 38 — Typed commands for procedural NPC behavior

Part of [Todo 11 — NPCs, dialogue, and travel](todo-11.md).

## Why
This is the core parity grind: every procedural gap in the NPC import must become a reviewed, typed TypeScript command until the import report reaches zero. There will be no general Lua evaluator — ever.

## Remaining work
- 2,307 procedural keyword actions, 21 dynamically composed messages, and 601 custom dialogue callbacks across 494 selected definitions remain unexecuted/unapproximated.
- Add reviewed typed quest/travel/blessing/action commands until the report reaches zero; no general Lua evaluator.
- Three Black Bert shop rows reference item ids absent from the pinned catalog — keep these as explicit source-invalid exclusions in the report, not silent omissions.

## Implementation
- Grow the action vocabulary in `server/src/npc/NpcDialogueExecutor.ts` / `server/src/npc/DialogueGraph.ts`, following the existing typed-action composition pattern per command family: `server/src/npc/withBoatTravelRoutes.ts`, `withPromotionActions.ts`.
- Reviewed content lives in `content/npcs/canary-dialogues.json`, overriding the generated baseline.
- The import report (`content/npcs/canary-npc-import-report.json`) drives a monotonically shrinking gap count — every landed command family reduces it and the parity test tightens.
- Every new action re-validates at execution time inside the tick (range/floor/state/money/items), never at enqueue (charter rule 4). Money-touching actions (blessings, fees) run as one ACID transaction with audit entries (charter rules 2/11), following the shipped travel-payment pattern in `PgNpcTravelStore.ts`.
- Canary reference: the 494 definitions' Lua callbacks in opentibiabr/canary are the source of truth for each command's semantics.

## Tests
- Per-command-family tests in the `NpcHandler.test.ts` / `NpcDialogueExecutor` style: forged action ids rejected, execution-time re-checks enforced, money legs atomic.
- Gap-count regression test asserting the report's unexecuted counts never increase.
- Black Bert exclusions asserted as explicit source-invalid entries.

## Dependencies
- Feature 103 (quest platform) for quest-hook commands and storage gates.
- Bank (shipped) and shop completions (Feature 46) for money actions; blessings (Feature 72) for blessing commands.
- Feature 37 (typed NpcType model), Feature 40 (graph engine to host conditions).
