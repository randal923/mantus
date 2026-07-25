# Feature 65 (client) — VIP groups and the typing indicator

Part of the [client backlog](README.md). Server side shipped:
[completed log](../completed/implementation-feature-65-completed.md).

## Why
Two of Feature 65's pieces have full protocol and server support but no client
surface: VIP groups, and the ephemeral typing state.

## Remaining work

### VIP groups
- Render `vip-state.groups` as headers in `VipPanel`, with ungrouped entries
  (`entry.groupId === null`) in a trailing section.
- Create a group, delete a group, and move an entry into or out of one.
  `GameClient` already exposes `createVipGroup`, `deleteVipGroup`, and
  `assignVipGroup`.
- Deleting a group must not read as deleting its entries — the server drops
  them back to the ungrouped list, so the UI should say so.

### Typing indicator
- Send `sendTypingHint(counterpart)` from `ChatComposer` while the player is
  typing into a **private** conversation. The server rate-limits to one per
  second, so debounce client-side too rather than sending per keystroke.
- Handle `chat-typing-state` — currently unhandled anywhere in the client, so
  the message falls through silently. Add a branch in
  `handleCommunityMessage.ts` that stores `{ counterpart, at }` and have
  `ChatPanel` show "<name> is typing…" for ~3 s.
- The state is deliberately ephemeral: never persist it, and clear it on
  disconnect alongside the other per-session state in
  `handleGameClientStatus`.

## Implementation
- `useVipSession` already carries `groups` from `vip-state`; the panel work is
  presentation only.
- Typing state is small and short-lived — a single store field
  (`typingByCounterpart: Record<string, number>`) is enough; no session hook.
- New components: `client/components/social/VipGroupSection.tsx` (or extend
  `VipEntryRow` with a group control — one exported component per file either
  way).

## Tests
- `VipPanel` story with two groups plus ungrouped entries.
- A unit test for whatever helper decides "is this counterpart still typing"
  given a timestamp and a now, in `client/lib/chat/`.

## Dependencies
None; server and protocol ship.
