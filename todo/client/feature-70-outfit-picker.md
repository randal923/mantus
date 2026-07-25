# Feature 70 (client) — the outfit window

Part of the [client backlog](README.md). Server side shipped:
[done.md record](../done.md).

## Why
Outfit and addon entitlements, the pinned catalog, and execution-time
selection validation all ship, but the client has **no outfit surface at all**:
`outfit-get`, `outfit-state`, `outfit-select`, and `outfit-action-failed` are
unhandled, so a player cannot change outfit even when entitled.

## Remaining work
- An outfit window: the entitled outfits from `outfit-state.outfits`, the four
  colour channels, the addon toggles, and a live preview.
- Send `outfit-get` when the window opens and `outfit-select` on confirm.
- Handle `outfit-action-failed` (`not-owned`, `rate-limited`,
  `invalid-request`) with real wording.
- An entry point: the character/HUD menu, plus the `contextMenu` "Set outfit"
  entry on the own player if that menu is the natural home.

## Implementation
- New `client/hooks/useOutfitSession.ts` mirroring `useVipSession`: hold
  `outfits`, `mounts`, `selectedLookType`, `selectedMountId`, `pending`,
  `error`; add a branch for `outfit-state` / `outfit-action-failed` in
  `handleCharacterSessionMessage.ts` (it is own-character state, not
  community state) and register the session in
  `GameWindowSessionController`.
- `GameClient` needs `getOutfits()` and `selectOutfit(...)`; they are the only
  two intents and are not written yet.
- The preview can reuse `client/lib/render/getOutfitPortraitCanvas.ts`, which
  already renders an outfit with colours off-screen — prefer it over a second
  PixiJS surface inside a modal.
- **Addon bits are a mask**: `addons` is `0..3` where bit 0 and bit 1 are the
  two addons. `outfit-state` reports the *granted* mask per outfit; a checkbox
  for an ungranted bit must be disabled, because the server refuses the whole
  selection rather than silently dropping the bit.
- Locale keys: a new `outfit.*` section (title, addon labels, colour channel
  labels, `outfit.errors.*`). Add to both locale files.

## Tests
- Storybook: entitled outfits with one addon granted and one not, and the
  disabled-checkbox state that follows.
- A unit test for the mask helper ("which addon checkboxes are selectable for
  this granted mask") in `client/lib/outfit/`.

## Dependencies
- Unlock sources are server-side and still open (store, quests, achievements),
  so until one of them grants something the window will show only the two
  starter citizen outfits. That is correct behaviour, not a bug — say so in
  the empty state.
- The mount half of this window is
  [feature-71-mount-rendering.md](feature-71-mount-rendering.md).
