# Feature 35 — Channels, ignore lists, talkactions, and speech modes

Part of [Todo 10 — Chat and channels](todo-10.md).

## Why
Say/whisper/yell/private shipped with strict server-side enforcement; everything beyond those modes was deferred. Channels, ignore lists, and talkactions are the remaining player-visible chat surface, and talkactions must be typed server actions — never Lua.

**Shipped 2026-07-25** (see
[completed/implementation-feature-35-completed.md](completed/implementation-feature-35-completed.md)):
the public channel system (Game Chat, Trade, Help) with membership re-checked
per line, the bounded channel/ignore zod intents, per-character ignore lists
that suppress every delivery path without leaking, player talkactions as typed
server actions, the client channel tabs, and the channel/talkaction parity
inventory test.

## Remaining work
- Guild and party chat still ship as their own intents rather than registry
  channels; unifying them is optional cleanup, not missing behaviour.
- Admin talkactions (waiting on Feature 96's admin-surface conventions).
- GM/broadcast speech modes and moderation channels; richer system-message
  categories beyond the new `server-notice`.
- Persisting ignore lists — they are memory-only today, so they survive a
  relogin but not a restart.

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
