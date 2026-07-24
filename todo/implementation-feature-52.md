# Feature 52 — Registry-wide execution guarantees and flag parsing

Part of [Todo 13 — Typed world actions](todo-13.md).

## Why
Each shipped handler individually satisfies the execution-time guarantees, but as more kinds land the guarantees must hold registry-wide, and several DAT flags and deferred UX flows remain unparsed/unbuilt, leaving item classes baked draw-only or failing closed.

## Remaining work
- Cross-cutting guarantee boxes to hold for every future handler:
  - Execution-time re-check of item/version, position, reach, floor/LOS, requirements, cooldown, target, destination, capacity/state.
  - Synchronous tick application + atomic coupled persistence — no `await` between validation and mutation.
  - Visibility-filtered result messages (nothing sent the player cannot see).
- `m_transformOnUse` appearance flag not parsed (0 entries) — use-transforms beyond `rotateTo` are unregistered and fail closed.
- 181 rotatable-but-immobile types (42 map instances) are baked draw-only; promote via `MUTABLE_ITEM_IDS` if wanted.
- Look deferred: DAT `ignoreLook` not parsed; creature look shows name only; no shift+left-click look alias.
- Ctrl-menu deferred: no "Use with…"/Trade/Follow/Talk entries; inventory slots keep direct right-click.
- Pixel-perfect hit-testing deferred: elevation/displacement not reversed on click.
- Write-map path for blackboards missing.

## Implementation
- Guarantee boxes satisfied per-handler as kinds land; consider a shared precondition helper in `server/src/action/WorldActionContext.ts` so re-checks cannot be forgotten.
- Flag parsing (`m_transformOnUse`, `ignoreLook`) in `tools/importTibiaAssets.mjs` plus catalog regeneration; mutable-item promotion via `MUTABLE_ITEM_IDS` in `tools/getMapItemSemantics.mjs`.
- Write-map needs a new bounded zod intent in `protocol/` with max text size and rate expectation defined before the handler (charter: new packets get schema + max size + rate first), server-side length/permission validation at execution time.

## Tests
- Shared-precondition helper covered so a handler that skips a re-check fails a test, not production.
- Write-map: oversized/over-rate text rejected; concurrent writes to one blackboard leave one coherent text.
- Regenerated catalogs keep existing shipped-handler behavior green (`WorldActionRegistry.test.ts`).

## Dependencies
- Features 50 and 51 (the handlers these guarantees apply to).
- Asset-import pipeline regeneration for the flag parsing.
