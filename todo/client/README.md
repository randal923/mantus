# Client backlog

The single index of outstanding client-side work, rewritten 2026-07-25 to
cover the whole game, not just the Features 61–71 batch. This folder lives
under `todo/` so [`todo/README.md`](../README.md) stays the one entry point.

Every feature file here is **client-only**: the protocol, the server
handlers, the stores, and the exploit tests already ship. Nothing below
changes what the server enforces — a missing panel means a player cannot
*reach* a feature, not that the feature is unguarded. Mixed client/server
engineering tracks stay in the main backlog and are listed at the bottom so
this index is still exhaustive for "what's left on the client".

## Remaining work

| File | Feature | Weight |
|---|---|---|
| [feature-67-profile-ui.md](feature-67-profile-ui.md) | 67 | Large — no client surface at all yet |
| [feature-23-combat-panels.md](feature-23-combat-panels.md) | 23 | Medium — analyzer panel + aim-at-target toggle |
| [feature-69-movable-panels.md](feature-69-movable-panels.md) | 69 | Medium |
| [feature-65-vip-groups-and-typing.md](feature-65-vip-groups-and-typing.md) | 65 | Medium |
| [feature-58-guild-bank-ui.md](feature-58-guild-bank-ui.md) | 58 | Small — bank section in the guild modal |
| [feature-43-store-history-ui.md](feature-43-store-history-ui.md) | 43 | Small — history tab + inbox-delivery cue |
| [feature-68-marker-editing.md](feature-68-marker-editing.md) | 68 | Small |
| [feature-62-door-list-editor.md](feature-62-door-list-editor.md) | 62 | Small |
| [feature-102-gm-console.md](feature-102-gm-console.md) | 102 | Small — render gm-response in chat |
| [feature-49-market-selection.md](feature-49-market-selection.md) | 49 | Tiny — selection survives a refresh |
| [cross-cutting-locales.md](cross-cutting-locales.md) | 62–71 | Small, but do it first — pure text |

## Recommended order

1. [cross-cutting-locales.md](cross-cutting-locales.md) — cheap, and several
   already-shipped paths currently fall back to a generic message.
   (The outfit window and mounted rendering — the former items 70/71 here —
   shipped 2026-07-26; see [done.md](../done.md).)
2. [feature-67-profile-ui.md](feature-67-profile-ui.md) — largest single
   piece; build the list components so Feature 83 (Cyclopedia) can reuse them.
3. The small unblocked panels in any order: 23, 43, 58, 102, 49, 68, 62.
4. [feature-69-movable-panels.md](feature-69-movable-panels.md) and
   [feature-65-vip-groups-and-typing.md](feature-65-vip-groups-and-typing.md)
   whenever convenient.

## Related client tracks that live in the main backlog

These are client-heavy but not "server already ships" — they involve protocol
additions, investigation, or measure-first gating, so their files stay with
their areas:

- [Feature 87 — Client polish](../todo-11.md): lighting/
  day-night, sound (needs real assets first), hotkey/settings persistence,
  battle-list/HUD polish, bounded modal windows (protocol schema first).
- [Feature 88 — Performance budgets and streaming](../todo-11.md)
  and [Feature 107 — deferred perf items](../todo-11.md):
  measure first.
- [Features 90–92 — Session resilience](../todo-11.md): revisioned stream,
  connection state machine, error taxonomy — protocol + server + client
  together.
- [Feature 77 — Bestiary accepted-limitation fixes](../todo-10.md): its
  client slivers (route `bestiary-action-failed` to both modals, queue a
  second sheet request inside the cooldown) ride with the server
  kill-credit fix.
- [Feature 22 — two spell icons](../todo-5.md): blocked on
  external OTClient data.

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
- Client previews (cooldowns, counts, clamps) are decoration; the server's
  version is the real one. Never turn a client clamp into the only check.

[Back to the backlog overview](../README.md)
