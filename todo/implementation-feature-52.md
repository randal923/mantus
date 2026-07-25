# Feature 52 — Registry-wide execution guarantees and flag parsing

Part of [Todo 13 — Typed world actions](todo-13.md).

The shared precondition table and the write-map path shipped 2026-07-25 — see
the [completed log](completed/implementation-feature-52-completed.md).

## Remaining work

- **Asset-flag parsing, blocked on an asset regeneration.** `m_transformOnUse`
  (0 entries) and `ignoreLook` are parsed-and-dropped by
  `tools/importTibiaAssets.mjs`. Capturing them means regenerating
  `objects.json` and the sprite atlases from the pinned `Tibia.dat`/`.spr`,
  which live outside the repo; that regeneration was deliberately not attempted
  while shipping the guarantees. Until then, use-transforms beyond `rotateTo`
  stay unregistered and fail closed. Canary's own bidirectional transform
  tables (`carpets.lua`, `windows.lua`, the trap-disarm action) are an
  alternative source that needs no DAT change — see
  `content/canary-world-action-parity.json`, where they are classified
  `deferred`.
- 181 rotatable-but-immobile types (42 map instances) are baked draw-only;
  promote via `MUTABLE_ITEM_IDS` if wanted.
- Look deferred: DAT `ignoreLook` not parsed; creature look shows name only; no
  shift+left-click look alias.
- Ctrl-menu deferred: no "Use with…"/Trade/Follow/Talk entries; inventory slots
  keep direct right-click.
- Pixel-perfect hit-testing deferred: elevation/displacement not reversed on
  click.

## Implementation

- Every new kind adds a row to `WORLD_ACTION_REQUIREMENTS` in
  `server/src/action/worldActionPreconditions.ts`; the registry runs the table
  before dispatch, and both the compiler and `worldActionPreconditions.test.ts`
  fail if a kind is added without one.
- Flag parsing in `tools/importTibiaAssets.mjs` plus catalog regeneration;
  mutable-item promotion via `MUTABLE_ITEM_IDS` in
  `tools/getMapItemSemantics.mjs`.

## Tests

- Shared-precondition helper covered so a handler that skips a re-check fails a
  test, not production — **done**.
- Write-map: oversized/over-rate text rejected; concurrent writes to one
  blackboard leave one coherent text — **done**.
- Regenerated catalogs keep existing shipped-handler behavior green
  (`WorldActionRegistry.test.ts`).

## Dependencies

- Asset-import pipeline regeneration for the flag parsing.
