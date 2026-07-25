# Todo 7 — Chat, channels, and NPCs

**Features 35, 38, 40, 41.** Shipped: local chat with session-derived
identity and flood mutes, public channels with per-line membership, ignore
lists, player talkactions, the channel/talkaction parity inventory, chat
observability; on the NPC side: all placements/types, the typed `NpcType`
model, fail-closed import validation, the typed dialogue-graph engine, six
typed command families (2,307 → 611 procedural gaps), the travel
gating/discount engine, and carried-first/bank-fallback fares (see
[done.md](done.md)). The remaining NPC grind is content transcription —
most of it needs the pinned Canary checkout.

## Feature 35 — Channels, ignore lists, talkactions, speech modes (remainder)

**Remaining work**

- Admin talkactions (on Feature 96's admin-surface conventions, todo-12) —
  authorize against the session's own role, never a message-body id.
- GM/broadcast speech modes and moderation channels; richer system-message
  categories beyond `server-notice`.
- **Durable ignore lists** (single owner after the restructure): memory-only
  today — survives relogin, not restart. Per-character table loaded at
  attach next to the durable mute; the suppression path needs no change.
- Optional cleanup, not missing behavior: unify guild/party chat onto the
  channel registry.

**Implementation:** channel registry work continues in
`server/src/chat/` alongside `ChatHandler.ts`; membership is checked at
execution time per line (a player kicked mid-tick must not deliver);
schemas stay `.strict()` with no forgeable sender. Client tabs extend
`client/components/chat/ChatPanel.tsx`; text stays inert.

**Tests:** membership revocation takes effect at execution time; ignore
suppression leaks nothing to the ignored sender; forged channel ids /
talkaction payloads rejected; flood limits cover channel messages and
talkactions; the parity inventory keeps failing on unowned entries.

## Feature 38 — Typed commands for procedural NPC behavior (611 left)

Every procedural gap becomes a reviewed typed TypeScript command until the
import report reaches zero. No general Lua evaluator — ever.

**Remaining work**

- **316 callback branches outside the typed grammar** — 266 condition + 50
  effect callbacks whose bodies aren't pure storage ops. By shape:
  `hasBlessing(n)` (116, blocked on Feature 72),
  `getHealth() < n` (29), `getMoney() + getBankBalance() >= n` (22),
  `getItemById`/`getItemCount` (31), multi-clause conjunctions (35), and
  item-granting effects. Each needs its own typed condition/effect kind plus
  an execution-time evaluation surface.
- **27 `StdModule.bless`** — blocked on Feature 72 (purchase/persistence/
  consumption).
- **30 `travel`/`kick` calls with table/expression destinations** — needs a
  multi-destination offer shape with server-rolled selection (shared with
  Feature 40).
- **~13 one-off handlers** — `townTravelHandler`, `donationHandler`, wedding
  handlers, Wayfarer/dream quest steps — blocked on Feature 103 (todo-13).
- **21 dynamically composed messages** and the remaining reported
  `proceduralCallbacks`.
- **181 source-invalid spell offers** (spells outside the pinned catalog) and
  Black Bert's three stale shop rows stay explicit exclusions — never loosen
  resolution to "fix" them.

**Implementation:** grow the action vocabulary in
`server/src/npc/NpcDialogueExecutor.ts` / `DialogueGraph.ts` (follow the
shipped families and `withBoatTravelRoutes.ts`); extend the condition grammar
in `server/src/npc/evaluateDialogueConditions.ts` and the translator in
`tools/parseCanaryNpcDialogues.mjs` (`translateCondition`/`translateEffects`)
in lockstep; reviewed content in `content/npcs/canary-dialogues.json`
overrides the baseline. Every action re-validates at execution time inside
the tick; money-touching actions are one ACID transaction with audits
(follow `PgSpellTeacherStore.ts` / `PgPromotionStore.ts`).

**Tests:** per-family `NpcTypedCommands.test.ts`-style suites (forged ids
rejected, execution-time re-checks, atomic money legs); lower the ceilings in
`server/src/npc/npcImportParityGate.test.ts` with every landed family — they
may never rise.

## Feature 40 — Dialogue-graph engine completion

The typed graph (conditions, effects, focus rules), execution-time
re-validation, and the parity fixture shipped.

**Remaining work**

- Condition kinds beyond storage/level/premium: blessings, carried item
  counts, health, money (carried + bank) — each with a typed condition, a
  live-state evaluation path inside the tick, and an importer translation
  (counts in Feature 38 above).
- Quest-requirement conditions proper — storage is the data layer; Feature
  103 owns semantics and the key namespace.
- Effects beyond `set-storage` — item grants/removals in the same
  transaction as any money leg.
- Delayed speech and dynamic profession/quest greetings (the 21 composed
  messages).
- Multi-destination travel offers with server-rolled choice.

**Implementation:** extend `DialogueCondition` in
`server/src/npc/DialogueGraph.ts` + `evaluateDialogueConditions.ts`; every
new kind evaluates at node-execution time, never at offer time. Preserve the
shipped conversation invariants (opaque server-issued ids, explicit offered
choices, private delivery, server-clock timeouts, cleanup on
logout/death/removal, wandering paused, unfocused branches open no
conversation).

**Tests:** `dialogueGraphParity.test.ts` keeps passing per new kind;
`loadNpcDialogueGraphsFailClosed.test.ts` gets one injected defect per new
kind; state changed between offer and confirmation rejects.

## Feature 41 — Gated and quest travel routes (content)

The engine shipped (execution-time `conditions`, server-computed
`discounts`, a `not-allowed` outcome that never names the gate). Everything
left is transcription from pinned Lua — **needs the Canary checkout**; no
`.lua` is vendored here.

**Remaining work**

- Storage-gated Yalahar and Goroma passages → offers in
  `server/src/npc/boatTravelRoutes.ts` with `conditions`.
- Six remaining `StdModule.travel` boats: `captain-chelop`, `captain-cookie`,
  `captain-fearless`, `captain-pelagia`, `captain-waverider-island`,
  `jack-fate`.
- Three `townTravelHandler` branches on `captain-dreadnought`.
- 24 `StdModule.kick` handlers, all `nonLiteralDestination` — the `teleport`
  action kind exists; each needs its destination read from source.
- Postman discounts (needs the Postman rank storage keys — Feature 105) and
  travel-triggered mission side effects as typed post-travel commands inside
  the fare's own transaction and audit trail.

**Tests:** per route family — forged route id rejected; gated route refused
without the storage; mission side effects exactly-once, atomic with payment
(`TravelService.test.ts`).

[Back to overview](README.md)
