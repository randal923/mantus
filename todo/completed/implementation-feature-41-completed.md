# Feature 41 — completed sub-work

Gated and quest travel routes, from
[implementation-feature-41.md](../implementation-feature-41.md). The feature
stays **open**: the engine ships here, the route *content* needs a Canary
checkout (see [canary-checkout-required](../implementation-feature-41.md)).

Cross-links: [implementation-feature-41.md](../implementation-feature-41.md) ·
[implementation-feature-42.md](../implementation-feature-42.md) ·
[implementation-feature-40.md](../implementation-feature-40.md) ·
[todo-11.md](../todo-11.md).

---

## 2026-07-25 — Execution-time route gates and server-computed discounts

**Problem.** Every conditional route was deferred because there was no way to
express "this passage requires quest state" or "this rank pays less", and the
charter forbids enabling a route without an execution-time access check.

**What changed.**

- `NpcTravelOffer` gained `conditions` (a `DialogueCondition[]` access gate)
  and `discounts` (`{ conditions, cost }[]`, first match wins).
- `TravelService.start` evaluates `offer.conditions` **at confirmation**, not
  when the route was listed, and returns a new `"not-allowed"` outcome. Quest
  state moves between listing and confirming; only the later check counts
  (charter rule 4).
- `server/src/npc/travelFareFor.ts` (new) resolves the fare from live server
  state. `TravelService` passes *that* to `store.commit`, so the charged fare
  is computed at execution time and the client supplies only an offer id
  (charter rule 1). A discount can never raise a fare — it is clamped to the
  listed cost.
- `renderNpcDialogueText` quotes `|TRAVELCOST|` at the same discounted rate, so
  the quote matches what the confirmation will charge. It is still only a
  quote: the fare is recomputed at confirmation.
- The refusal line is deliberately vague ("I am not allowed to take you
  there") — naming the gate would leak the quest storage key it checks
  (charter rule 6). Storage keys stay entirely server-side.
- `withBoatTravelRoutes` carries both fields through from content, and
  `boatTravelRoutes.ts` documents the contract.

**Files touched.** `server/src/npc/{DialogueGraph,TravelService,renderNpcDialogueText,sendNpcDialogueResponses,NpcDialogueExecutor,withBoatTravelRoutes,boatTravelRoutes}.ts`,
`server/src/npc/travelFareFor.ts` (new).

**Verification.** `TravelService.test.ts` gains four cases: a storage-gated
route is refused with `not-allowed` and never reaches the store; the gate is
re-checked at confirmation, so unlocking it between listing and confirming
works; a rank discount charges the *discounted* fare; a player without the rank
is charged the full one. `travelFareFor.test.ts` covers first-match ordering,
the no-raise clamp, and offers with no discounts. Full suite: `vitest run`
958 passed.

**What is still blocked — content, not code.** The specific gated routes
(Yalahar, Goroma), the six remaining `StdModule.travel` boats
(captain-chelop, captain-cookie, captain-fearless, captain-pelagia,
captain-waverider-island, jack-fate), the three `townTravelHandler` branches
(captain-dreadnought) and the 24 `StdModule.kick` handlers all sit in
`content/npcs/canary-npc-import-report.json` as unsupported entries. Every kick
is flagged `nonLiteralDestination`, so its destination is not a literal in the
pinned Lua and cannot be resolved without reading the source. There is no
Canary checkout in this repo and no vendored `.lua`, so the routes cannot be
transcribed here. The engine they need is now in place; adding them is a
content pass with `CANARY_PATH` set.
