# Client backlog for Features 61–71

Front-end work still outstanding after the 2026-07-25 batch that shipped
Features 61–71 (see `todo/completed/implementation-feature-6*-completed.md`
and `-7*-completed.md`). This folder lives under `todo/` with the rest of the
backlog rather than as a separate top-level tree, so the index in
[`todo/README.md`](../README.md) stays the single entry point.

Every item here is **client-only**: the protocol, the server handlers, the
stores, and the exploit tests already ship. Nothing below changes what the
server enforces — a missing panel means a player cannot *reach* a feature, not
that the feature is unguarded.

## What already landed on the client

| Feature | Client work done |
|---|---|
| 61 — House auctions | `HouseAuctionSection`, auction column in `HouseBrowserSection`, bid/outbid/won toasts, locales |
| 62 — House access lists | `HouseTextListSection` for the two house-wide lists |
| 63 — Guildhall purchase | Buy control shown for guildhalls with guild-balance wording |
| 64 — House polish | None needed (rent letters read through the existing item-text path) |
| 65 — Friends | `FriendRequestsSection` in `VipPanel`, `friend-state` in `useVipSession` |
| 68 — Minimap | Click-to-walk, right-click flags, flag + town-label rendering, `minimapVersion` cache-busting |
| 69 — UI settings | Reset-layout control, `ui-settings-updated` applied to live sessions |
| 70 — Outfits | Only the `starterLookType` split in `CreateCharacterForm` |

## Remaining work

| File | Feature | Weight |
|---|---|---|
| [feature-67-profile-ui.md](feature-67-profile-ui.md) | 67 | Large — no client surface at all yet |
| [feature-70-outfit-picker.md](feature-70-outfit-picker.md) | 70 | Large — no client surface at all yet |
| [feature-71-mount-rendering.md](feature-71-mount-rendering.md) | 71 | Medium — renderer change, asset-format sensitive |
| [feature-69-movable-panels.md](feature-69-movable-panels.md) | 69 | Medium |
| [feature-65-vip-groups-and-typing.md](feature-65-vip-groups-and-typing.md) | 65 | Medium |
| [feature-68-marker-editing.md](feature-68-marker-editing.md) | 68 | Small |
| [feature-62-door-list-editor.md](feature-62-door-list-editor.md) | 62 | Small |
| [cross-cutting-locales.md](cross-cutting-locales.md) | 62–71 | Small, but do it first — it is pure text |

## Recommended order

1. [cross-cutting-locales.md](cross-cutting-locales.md) — cheap, and several
   already-shipped paths currently fall back to a generic message.
2. [feature-70-outfit-picker.md](feature-70-outfit-picker.md), then
   [feature-71-mount-rendering.md](feature-71-mount-rendering.md) — the mount
   picker lives inside the outfit window, so the picker comes first.
3. [feature-67-profile-ui.md](feature-67-profile-ui.md) — largest single piece;
   coordinate with Feature 83 (Cyclopedia), which displays the same
   projections.
4. Everything else in any order.

## Conventions these files assume

- `client/AGENTS.md` and `client/ASSETS.md` are mandatory for anything that
  touches sprites.
- One exported component per file, named after the file; no helper components
  below a component.
- Every user-visible string goes through `useAppTranslation`, with keys added
  to **both** `client/locales/en.json` and `client/locales/pt-BR.json`.
- New panels reuse the drag/resize helpers in
  `client/lib/minimap/resizeMinimapLayout.ts` and persist through
  `uiSettingsSchema`, never through local storage.
- Server messages are handled by adding a branch to the matching
  `client/components/game-window/messages/handle*Message.ts`; an unhandled
  type silently falls through to `worldRenderer.applyMessage`, so a missing
  branch is invisible rather than loud — add the branch and a store field
  together.

[Back to the backlog overview](../README.md)
