# Chat and channels

Chat depends on selected [`characters`](01-characters.md) and z-aware
visibility. It is its own feature because its rate limits, moderation, and
privacy rules differ from NPC dialogue.

## Protocol and routing

- [x] Define bounded zod intents for say, whisper, yell, and private message
  (`protocol/src/chat.ts`). Channel-message intents are deferred until guild/
  party/help channels exist (see [14-social-and-houses](14-social-and-houses.md)).
  Channel ids and recipients are references, never authority.
- [x] Derive speaker character/name from the session; the schemas have no
  sender field to forge and extra fields are rejected (`.strict()`).
- [x] Enforce character limits (255, Canary parity), a no-control-character
  policy, flood limits (4-message burst, one slot per 1.5 s, 5·n² s escalating
  mutes), and mute state at execution time. Recipient/channel membership is
  N/A until channels exist. Ignore lists are still missing.
- [x] Route local speech using floor-aware visibility and mode-specific range:
  say/whisper reach normal view range (whisper muffles to "pspsps" beyond one
  tile), yell reaches 18x14 (Canary's doubled viewport), uppercased, behind a
  30 s exhaust and a level-2 minimum. Local chat is never broadcast world-wide.
- [x] Private messages resolve online recipients by name; the sender learns
  online/offline and nothing else, and offline probes consume the flood
  budget. Moderation channels and richer system-message categories are still
  undefined.
- [ ] Match every pinned Canary speech mode, channel type, NPC/private routing,
  mute/ignore rule, guild/party/help channel permission, and player/admin
  talkaction. Commands execute typed server actions rather than Lua.
  (Shipped so far: say/whisper/yell/private with Canary ranges and mute
  formula. Missing: all channels, ignore lists, talkactions, NPC routing,
  GM/broadcast speech.)

## Safety and persistence

- [x] Escape/render all text as text; the panel renders React text nodes and
  world speech is canvas text (regression story `PlayerTextIsInert`).
- [x] Avoid logging private message bodies or credentials — chat bodies are
  never logged. Moderation retention remains undefined.
- [ ] Add flood/spam metrics. Escalating server-side mutes exist
  (`ChatRateLimiter`), but there is no observability for them yet, and the
  mute/exhaust escalation state is in-memory only: it survives relog but
  resets on server restart. Buffer capacity is a constant, not config.
- [ ] Keep reporting/muting/audit metadata separate from gameplay chat payloads.

## Client

- [x] Add an accessible tabbed chat panel for default, private, and subscribed
  channels with bounded local history.
- [x] Render speech text only for server-delivered speakers
  (`SpeechTextRenderer`), keyed per speaker, expiring by length, removed on
  creature-left and renderer destroy.
- [x] Clearly distinguish system (read-only gold channel), private (violet
  tabs per counterpart), own lines, and failure notices (localized
  `chat-rejected` reasons). NPC speech is pending the NPC system
  ([10-npcs](10-npcs.md)).

## Planned file surface

- `protocol/src/chat.ts`, `server/src/chat/ChatHandler.ts`,
  `ChatChannelRegistry.ts`, `ChatRateLimiter.ts`.
- `client/components/chat/ChatPanel.tsx`, focused message list/input/tab files,
  and world-speech rendering.

## Required tests

- [x] Forged sender fields are rejected (`ChatIntentSchemas.test.ts`); channel
  membership tests come with channels.
- [x] Wrong-floor/out-of-range local speech is never delivered
  (`ChatHandler.test.ts`).
- [x] Flood, oversized payloads, controls, and mute are enforced server-side.
  Ignore rules are not implemented yet.
- [x] Private content is not delivered to bystanders and chat bodies are never
  logged.
- [x] HTML/script-like text is rendered inert (`ChatPanel.stories.tsx`,
  `PlayerTextIsInert`).
- [ ] Channel/speech/talkaction parity inventory has no unowned or unsupported
  registered player-visible entry.

[Back to overview](README.md)
