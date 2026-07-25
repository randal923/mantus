# Feature 40 — completed sub-work

Dialogue-graph engine completion, from
[implementation-feature-40.md](../implementation-feature-40.md). The feature
stays **open** for the branches Feature 103 (quest platform) and Feature 72
(blessings) own — see the ceiling in `npcImportParityGate.test.ts`.

Cross-links: [implementation-feature-40.md](../implementation-feature-40.md) ·
[implementation-feature-38.md](../implementation-feature-38.md) ·
[todo-11.md](../todo-11.md).

---

## 2026-07-25 — Condition nodes, effects, focus model, execution-time re-checks

**Problem.** The engine ran literal keyword trees plus four action kinds. There
was no formal condition model, no way to express a branch's state change, no
distinction between branches that answer inside a conversation and outside one,
and nothing asserting that every imported branch has an executable typed path.

**What changed.**

- `server/src/npc/DialogueGraph.ts` — `DialogueCondition` (`storage` with six
  comparison operators, `level`, `premium`), `DialogueEffect`
  (`set-storage`), plus `ungreet` and `focus` on nodes. Storage keys are dotted
  server-side quest paths and never reach a client.
- `server/src/npc/evaluateDialogueConditions.ts` (new) — one place that
  evaluates a branch's requirements against live state. Premium is re-derived
  from the account row's expiry, not from anything reported earlier.
- `server/src/npc/NpcDialogueExecutor.ts` — re-evaluates conditions at the
  moment the node executes and rejects the branch if state moved since the
  choice was offered; applies effects only after the node's action has
  committed; handles `ungreet` by closing the conversation after the line.
- `server/src/npc/matchNpcDialogueNode.ts` — takes a `focus` argument, so an
  `onlyUnfocus` branch can never be reached inside a conversation and an
  ordinary branch can never be reached outside one.
- `server/src/npc/NpcHandler.ts` / `NpcDialogueFlow.sayUnfocused` — an
  unfocused branch speaks one private line and opens no conversation, so there
  is no state to steal, replay, or continue.

**Files touched.** `server/src/npc/{DialogueGraph,evaluateDialogueConditions,NpcDialogueExecutor,NpcDialogueFlow,NpcHandler,matchNpcDialogueNode,loadNpcDialogueGraphs}.ts`.

**How it was verified.** `server/src/npc/dialogueGraphParity.test.ts` (new): all
949 interactive NPCs covered; every node resolves to an executable typed path
(known action kind, existing node/offer/shop references, non-empty hint table);
every condition and effect kind is one the executor can evaluate or apply;
every node is reachable from the graph's entry points; an unfocused branch
matches only in the unfocused pass; every money-touching branch carries a
server-side price. `NpcTypedCommands.test.ts` covers the execution-time
re-check rejecting a branch whose state changed after it was offered.
`loadNpcDialogueGraphsFailClosed.test.ts` covers 13 injected defect classes,
including unknown condition kinds, bad operators, non-path storage keys, and
unknown effect kinds.

**Residual risk.** The condition grammar covers storage, level, and premium.
Canary branches gated on blessings, carried item counts, health, or money are
still reported gaps rather than typed conditions — each needs its own
evaluation surface, and the blessing ones are blocked on Feature 72.
