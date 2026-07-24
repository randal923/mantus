# Feature 40 — Dialogue-graph engine completion

Part of [Todo 11 — NPCs, dialogue, and travel](todo-11.md).

## Why
The engine runs literal keyword trees plus a handful of typed actions; the formal graph model (conditions, quest requirements) and full execution-time re-validation are incomplete. Parity means every pinned dialogue branch is representable and re-checked at the moment it executes.

## Remaining work
- Typed dialogue graph with explicit node ids, input matches, response, conditions, and server action — no open-ended scripting evaluator.
- Re-check range/floor/state/quest requirements/money/items/travel destination at exact node/action execution time (quest-requirement and general condition re-checks await those systems).
- Continue until every pinned dialogue branch, focus rule, action, travel offer, shop link, and storage gate is represented.
- Delayed speech, dynamic profession/quest greetings, quest rewards, blessings, and remaining travel/state mutations need explicit TypeScript commands — the 2,307 keyword actions / 21 composed messages / 601 callbacks are owned by the import report (Feature 38).
- Parity fixture test: every imported dialogue/action has an executable typed path or an explicit non-content classification.

## Implementation
- Extend `server/src/npc/DialogueGraph.ts` with condition nodes and `server/src/npc/NpcDialogueExecutor.ts` with new action types whose re-validation runs inside the tick at execution time (charter rule 4 — never act on stale validation from when the intent was enqueued).
- Extend `server/src/npc/matchNpcDialogueNode.ts` / `matchesNpcDialogueInput.ts` for the richer input-match model.
- Follow the `withBoatTravelRoutes.ts` / `withPromotionActions.ts` composition pattern per command family.
- Preserve shipped conversation invariants: opaque server-issued conversation ids, explicit offered choices, private delivery, server-clock timeouts, cleanup on logout/death/removal, wandering paused during conversation.
- The parity fixture parallels `server/src/npc/loadNpcDialogueGraphs.test.ts`.

## Tests
- Parity fixture: every imported dialogue/action resolves to an executable typed path or explicit non-content classification.
- Condition nodes re-evaluated at execution: state changed between choice offer and confirmation must reject.
- Existing invariants stay green: dialogue state cannot be stolen/replayed/continued after range/floor/logout timeout; forged node/action ids, quest state, prices, destinations rejected.

## Dependencies
- Feature 37 (typed NpcType/content model), Feature 38 (command vocabulary).
- Feature 103 (quest platform) for quest-requirement conditions and storage gates.
- Bank (shipped) / Feature 46 (shop) / Feature 72 (blessings) for money- and blessing-touching branches.
