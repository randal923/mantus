# Feature 35 — Channels, ignore lists, talkactions, and speech modes

Part of [Todo 10 — Chat and channels](todo-10.md).

## Why
Say/whisper/yell/private shipped with strict server-side enforcement; everything beyond those modes was deferred. Channels, ignore lists, and talkactions are the remaining player-visible chat surface, and talkactions must be typed server actions — never Lua.

## Remaining work
- All channels (guild/party/help/etc.) with membership/permission enforcement, plus the deliberately deferred channel-message zod intents (channel ids/recipients remain references, never authority).
- Ignore lists.
- Talkactions — player and admin — executing typed server actions.
- NPC speech routing.
- GM/broadcast speech modes.
- Moderation channels and richer system-message categories.
- Final parity test: a channel/speech/talkaction parity inventory with no unowned or unsupported registered player-visible entry.

## Implementation
- Create the planned `server/src/chat/ChatChannelRegistry.ts` (it does not exist yet) alongside `server/src/chat/ChatHandler.ts`.
- Define channel-message schemas in `protocol/src/chat.ts` with max size and rate expectation first, before any handler (charter: new packets). Schemas stay `.strict()` with no forgeable sender field; speaker identity derives from the session.
- Channel membership checked at execution time per tick, not at subscribe time (charter rule 4) — a player kicked from a guild mid-tick must not deliver to the guild channel.
- Talkactions fit the existing typed-intent pattern dispatched in `server/src/GameServer.ts`; admin talkactions authorize against the session's own character/role, never a message-body id (charter rule 9).
- Ignore lists suppress delivery server-side — the ignored sender must not learn they are ignored beyond normal delivery silence (charter rule 6).
- Client: extend `client/components/chat/ChatPanel.tsx` tabs for subscribed channels; keep all text rendered inert (React text nodes / canvas text).
- NPC speech routing overlaps the shipped visibility-aware NPC chat path (old todo 10b) — mostly wiring, not new mechanics.
- Canary reference: channel definitions and talkaction inventory in opentibiabr/canary for the parity inventory.

## Tests
- Channel-membership enforcement: non-member sends and receives nothing; membership revocation takes effect at execution time.
- Ignore-list delivery suppression (and no information leak to the ignored party).
- Forged channel ids / talkaction payloads rejected by schema and bounds checks.
- Flood limits apply to channel messages and talkactions (existing `ChatRateLimiter` budget).
- Parity-inventory aggregate test failing on any unowned/unsupported registered entry.

## Dependencies
- Guild/party membership shipped (remaining guild/party polish is Features 55–58), so guild/party channels are implementable now.
- NPC routing overlaps todo-11 (largely shipped).
- Feature 96 (admin tooling) for admin talkaction surface conventions.
