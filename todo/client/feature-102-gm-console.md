# Feature 102 (client) — render gm-response in the game client

Part of the [client backlog](README.md). Server side shipped (dev tooling,
2026-07-18); see [Feature 102 in todo-12](../todo-12.md)
for the remaining server gaps.

## Why
GM chat commands (`/i`, `/spawn`, `/goto`, `/level`, `/heal`, `/where`,
`/kick`, `/ban`, `/mute`, `/raid`, `/coins`, …) reply with a `gm-response`
message (`protocol/src/gm.ts`). The headless playtest client reads it; the
PixiJS client has no handler, so in-browser GM/admin work is blind — the
command executes and the reply vanishes.

## Remaining work
- Dispatch `gm-response` in `client/lib/net/GameClient.ts` and surface it in
  the chat panel as a distinct system-style line (e.g. the read-only gold
  channel styling with a `[GM]` prefix), keeping the text inert as all chat
  rendering already is.
- Multi-line responses (e.g. `/where`, `/inspect`) render as one block, not
  interleaved lines.
- No locale work: responses are server-authored English dev/admin text; label
  only the tab/prefix.

## Implementation
- Add the message branch in the matching
  `client/components/game-window/messages/handle*Message.ts` and append to the
  chat store (bounded history, same cap as other channels) — an unhandled type
  falls through silently today, which is exactly the bug.
- Render through the existing `ChatPanel` system-message path; no new panel.

## Tests
- Store unit test: `gm-response` appends a system line and respects the
  bounded history.
- Storybook: chat panel with a multi-line GM response.

## Dependencies
None; the schema ships and the admin surface (Feature 96) replies through the
same message.
