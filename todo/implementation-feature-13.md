# Feature 13 — Trash holders

Part of [Todo 6 — Items and inventory](todo-6.md).

**Completed 2026-07-24.** Items dropped or thrown onto a trashholder-kind tile
(dustbin, sewer grate, water/lava/tar) are destroyed with a poff effect and an
audited destruction, keyed off the catalog kind of the destination tile
(`isTrashholderTile` over `world.getMapItems`). `planTrashDrop` handles the
carried drop (partial reduce, full destroy, container subtree leaf-first);
`planMoveMapItem` handles the throw of persisted/loot world items. One accepted
limitation: pristine static-seed decorations thrown onto trash fall through to
placement (see the completed log for why). Full record, files touched, and
verification in
[completed/implementation-feature-13-completed.md](completed/implementation-feature-13-completed.md).
