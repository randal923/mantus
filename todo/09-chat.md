# Chat and channels

Chat depends on selected [`characters`](01-characters.md) and z-aware
visibility. It is its own feature because its rate limits, moderation, and
privacy rules differ from NPC dialogue.

## Protocol and routing

- [ ] Define bounded zod intents for say, whisper, yell, private message, and
  channel message. Channel ids and recipients are references, never authority.
- [ ] Derive speaker character/name from the session; ignore client-supplied
  sender fields.
- [ ] Enforce UTF-8 byte/character limits, allowed control-character policy,
  per-mode rate limits, mute state, recipient/channel membership, and ignore
  lists at execution time.
- [ ] Route local speech using floor-aware visibility and mode-specific range.
  Do not broadcast local chat to the world or reveal hidden recipients.
- [ ] Define private/channel availability, online/offline behavior, moderation
  channels, and system-message categories explicitly.
- [ ] Match every pinned Canary speech mode, channel type, NPC/private routing,
  mute/ignore rule, guild/party/help channel permission, and player/admin
  talkaction. Commands execute typed server actions rather than Lua.

## Safety and persistence

- [ ] Escape/render all text as text; never inject player strings as HTML.
- [ ] Avoid logging private message bodies or credentials. If moderation
  retention is required, document access, encryption, retention, and deletion.
- [ ] Add flood/spam metrics and escalating server-side rate responses. UI-only
  cooldowns do not count.
- [ ] Keep reporting/muting/audit metadata separate from gameplay chat payloads.

## Client

- [x] Add an accessible tabbed chat panel for default, private, and subscribed
  channels with bounded local history.
- [ ] Render speech bubbles/text only for server-delivered visible speakers and
  handle creature removal/floor change cleanly.
- [ ] Clearly distinguish system, status, NPC, private, and failure messages.

## Planned file surface

- `protocol/src/chat.ts`, `server/src/chat/ChatHandler.ts`,
  `ChatChannelRegistry.ts`, `ChatRateLimiter.ts`.
- `client/components/chat/ChatPanel.tsx`, focused message list/input/tab files,
  and world-speech rendering.

## Required tests

- [ ] Forged sender/channel/recipient membership is rejected.
- [ ] Wrong-floor/out-of-range local speech is never delivered.
- [ ] Flood, oversized payloads, controls, mute, and ignore rules are enforced
  server-side.
- [ ] Private content does not appear in unrelated packets or ordinary logs.
- [ ] HTML/script-like text is rendered inert.
- [ ] Channel/speech/talkaction parity inventory has no unowned or unsupported
  registered player-visible entry.

[Back to overview](README.md)
