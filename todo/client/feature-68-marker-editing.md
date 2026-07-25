# Feature 68 (client) — marker icons, text, and walk-to feedback

Part of the [client backlog](README.md). Server side shipped:
[completed log](../completed/implementation-feature-68-completed.md).

## Why
Right-clicking the minimap toggles a default flag (`icon: 0`, empty text), but
`minimap-marker-set` carries an icon id (0–20) and up to 40 characters of text
that nothing in the client can set or display. Click-to-walk also gives no
feedback when the server finds no path.

## Remaining work
- A small marker editor: right-click an empty tile opens it (icon picker +
  text field, Save/Delete); right-click an existing flag opens it pre-filled.
  Today's behaviour — right-click toggles — should become "right-click opens",
  with delete inside the editor.
- Render marker text on hover, reusing the existing `MinimapPanel` hover
  tooltip that already handles creature markers.
- Walk-to feedback: the server silently ignores an unreachable or out-of-range
  destination, so the click currently does nothing visible. Draw a short-lived
  destination pip at the clicked tile and clear it when the path ends.

## Implementation
- `drawMinimap` already receives `mapMarkers` and draws the flag; extend it to
  draw the icon variant and, on the hovered marker, the text.
- The icon set is not imported yet — either reuse existing HUD icons or pick a
  small inline SVG set; do not add an asset import for this alone.
- Keep the editor a plain modal under `client/components/minimap/`.

## Tests
- Extend `client/lib/minimap/drawMinimap.test.ts` with a marker-rendering case
  (it already exercises the canvas through a stub context).
- Storybook case for the marker editor.

## Dependencies
None; server and protocol ship.
