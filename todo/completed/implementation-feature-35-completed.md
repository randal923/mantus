# Feature 35 — progress log

Cross-links: [todo-10.md](../todo-10.md) · [implementation](../implementation-feature-35.md).

This feature is **still open** — moderation channels, GM/broadcast speech, and
admin talkactions remain. This log records the sub-work that is finished.

---

## 2026-07-25 — Public channels, ignore lists, and typed talkactions

**Problem.** Say/whisper/yell/private shipped; everything beyond them was
deferred. There was no channel system at all (guild and party chat exist only
as their own intents), no ignore list, and no talkactions — and the charter
requires talkactions to be typed server actions, never Lua.

**What changed.**

- **`ChatChannelRegistry`** (new) declares the public channels as typed data:
  Game Chat, Trade, and Help (which keeps Canary's level floor). Each carries a
  `canJoin` predicate that is re-run **per line**, not at subscribe time, so a
  player who stops qualifying stops speaking and hearing on the very next
  message (charter rule 4). A channel id from a client is only ever a lookup
  key.
- **Protocol** (`protocol/src/chat.ts`): `channel-list-get`, `channel-open`,
  `channel-close`, `channel-speak`, `ignore-add`, `ignore-remove` intents (all
  `.strict()`, bounded, with no forgeable sender field), plus `channel-list`,
  `channel-message`, `channel-closed`, `ignore-list`, and a general
  `server-notice` server message. Two new `chat-rejected` reasons
  (`channel-not-open`, `ignore-list-full`) keep failures free of third-party
  detail.
- **Ignore lists** (`IgnoreList`, new) are per character, held for the server's
  lifetime so relogging cannot clear one, capped at 100 names. Suppression
  happens at delivery for local speech, yells, channels, and private messages
  — and the ignored speaker still gets the ordinary outgoing echo, so silence
  is the only signal they ever see (charter rule 6).
- **`TalkactionRegistry`** (new) holds player talkactions as reviewed
  TypeScript: `!uptime`, `!online` (a count, never a name list),
  `!serverinfo`, `!exp`. `ChatHandler` consumes a matching line before it is
  broadcast — the same order Canary's talkaction pass runs in — and answers the
  caller with a `server-notice`. Each one may only report server-wide facts or
  the caller's own state.
- **`ChatHandler`** owns the subscription map, routes the new intents, and
  drops a character's subscriptions on logout (the ignore list outlives them).
  `GameServer` routes the intents and supplies uptime/online/rate facts.
- **Client**: the chat reducer gained a `public` channel kind with its own tab
  styling; `channel-message` opens/updates a tab, `channel-closed` removes it,
  `channel-list` and `ignore-list` are held in the store, `server-notice` lands
  in the system log, and the composer routes a public tab's input to
  `channel-speak`. Closing a public tab unsubscribes server-side rather than
  just hiding the tab. `GameClient` gained the six matching calls.

**Files touched.**

- `protocol/src/chat.ts`, `protocol/src/clientMessages.ts`,
  `protocol/src/serverMessages.ts`
- `server/src/chat/ChatChannelRegistry.ts`, `IgnoreList.ts`,
  `TalkactionRegistry.ts` (all new), `server/src/chat/ChatHandler.ts`,
  `server/src/GameServer.ts`
- `client/lib/chat/chatReducer.ts`, `client/lib/net/GameClient.ts`,
  `client/components/chat/chatTypes.ts`, `chatStyles.ts`,
  `client/components/game-window/GameHudOverlay.tsx`,
  `messages/handleCommunityMessage.ts`,
  `messages/handleCharacterSessionMessage.ts`, store/state types

**Verification.** `yarn workspace server test` — 889 passed / 183 skipped, up
12. New `server/src/chat/ChatChannels.test.ts`: delivery reaches only current
subscribers; an unopened channel is refused; membership is re-checked per line
(a member who leaves the world stops receiving); a character below the Help
floor cannot open it; the channel list reports open state; an ignored speaker
is suppressed across say, channel, and private delivery while learning nothing;
the ignore list echoes and forgets; a talkaction answers only its caller and is
never broadcast; talkactions report only server-wide facts and the caller's own
state. The **parity inventory** tests assert every registered channel has a
definition, a label, and a reachable bounded intent, that an unregistered id
cannot even be expressed, that every registered talkaction is owned and
case-insensitively matched, and that oversized/forged chat payloads are
rejected. `yarn workspace client test` — 224 passed; all three workspaces
typecheck.

**Residual risk / still open.**

- **Guild and party chat are still their own intents**, not channels. They
  keep their own membership checks and delivery; unifying them under the
  registry is deliberate future work, not a gap in behaviour.
- **No moderation channels, no GM/broadcast speech mode**, and no admin
  talkactions — the admin surface waits on Feature 96's conventions. Dev GM
  commands still run through `GmCommandHandler` ahead of the chat pipeline.
- **Ignore lists are memory-only.** They survive a relogin only while the
  server is up; persisting them needs a table and belongs with the social
  stores.
- NPC speech routing was already covered by the shipped visibility-aware NPC
  chat path; nothing was needed here.
