# Feature 69 (client) — make the remaining panels movable

Part of the [client backlog](README.md). Server side shipped:
[completed log](../completed/implementation-feature-69-completed.md).

## Why
`uiSettingsSchema` now stores bounded `chat`, `battleList`, and `spellBar`
layouts alongside `minimap`, and the reset control already clears all four.
The three new keys are validated and persisted but never read: those panels
are still fixed-position, so the stored layout is dead weight until they move.

## Remaining work
- Give the chat panel, the battle list, and the spell bar the same drag and
  resize affordances the minimap panel has, persisting through
  `uiSettings.<panel>`.
- Honour the stored layout on mount, and fall back to the current fixed
  position when the key is absent (absent means "client default", which is
  what reset produces).

## Implementation
- Reuse `client/lib/minimap/resizeMinimapLayout.ts` and the
  `MinimapResizeBorder` component rather than writing new drag maths; if the
  helper needs to stop being minimap-specific, move it to
  `client/lib/ui/resizePanelLayout.ts` and update the minimap to import from
  there in the same change.
- Persist through the existing debounced `updateUiSettings` path used by
  `GameMinimapOverlay.onLayoutChange` — copy that shape exactly, including the
  `uiSettingsRef` write, so the live-session ack does not fight the debounce.
- `panelLayoutSchema` bounds are 160–1200 px on both axes; clamp to those
  before sending, or the server rejects the whole settings object.

## Tests
- A unit test per panel for "stored layout wins, absent layout falls back",
  mirroring `resizeMinimapLayout.test.ts`.
- Confirm reset returns all three to their defaults in one action.

## Dependencies
None; the schema, the reset control, and the cross-session ack all ship.
