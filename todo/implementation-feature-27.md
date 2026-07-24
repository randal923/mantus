# Feature 27 — Action-bar polish

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

## Why

The customizable spell and potion action bars shipped with accepted gaps (recorded 2026-07-20). These are client-side polish items; server-side slot validation already exists.

## Remaining work

- Action-bar update acks are ignored by the client; saves are debounced 800 ms, so an edit made right before closing the tab can be lost. Recorded fix: flush the pending update on `beforeunload`/disconnect (the minimap layout save needs the same flush).
- Only `origin: "spell"` entries are slottable; runes are still cast via the inventory ground-targeting flow. Recorded fix (if wanted): rune slots that arm the existing rune-targeting flow, showing the carried count as a badge.

## Implementation

- Client: add flush logic where `update-action-bar` is debounced, in the `/home/randal/code/tibia/client/components/game-window/` controllers; apply the same flush to the minimap layout save.
- Rune slots reuse the existing rune-arming/targeting flow; no new server surface — server-side slot validation already exists and remains authoritative.

## Tests

- Client test: pending debounced action-bar update is flushed on `beforeunload`/disconnect.

## Dependencies

- None; client-only.
