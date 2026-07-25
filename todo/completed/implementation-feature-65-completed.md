# Feature 65 — completed

Friend-system completion, from
[implementation-feature-65.md](../implementation-feature-65.md).

Cross-links: [todo-15.md](../todo-15.md),
[Feature 56](implementation-feature-56-completed.md).

---

## 2026-07-25 — Reciprocal friends, VIP groups, typing state, finder privacy

**Problem.** The shipped friend system was a one-way private VIP list: adding
someone told them nothing, there were no groups, no typing state, and Feature
56's party finder had no privacy switch to consume.

**What changed.** Reciprocal friendship is a separate relation from the VIP
list, so it got its own tables (migration `049_friends_and_vip_groups.sql`).
A request is a directed row; accepting it **deletes the request and writes
both halves of `character_friends` in one transaction**, so a friendship can
never exist in one direction only. The responder addresses the request by the
requester id the server itself sent — a forged id locks and matches no row, so
"accept a request that was never sent" fails at the store, not at a check the
client could skip. Crossing requests settle into a friendship immediately.

Presence rides only on accepted friendships: `FriendService` deliberately
reports pending requests as offline in both directions, so a request cannot be
used to probe whether someone is online. The other party is always
re-projected from *their own* snapshot, never from the actor's.

VIP groups are per-character named buckets on `character_vips.group_id`; the
assign statement resolves the group id against the same owner inside the
statement, so another list's group id can never be attached to your entry, and
deleting a group drops its entries back to the ungrouped list rather than
deleting them.

Typing state is `chat-typing` → `chat-typing-state`: ephemeral, never stored,
never echoed, rate-limited to one per second per session, forwarded only to
the named partner and dropped if that partner ignores the sender — the same
silence an ignored private message gets.

`character_social_settings.finder_visible` is the privacy switch Feature 56
was waiting for; `PartyHandler` reads it through `FriendService.isFinderVisible`
at query time, so flipping it hides an advert on the next listing.

**Files touched.**
`server/db/migrations/049_friends_and_vip_groups.sql`,
`server/src/social/{FriendService,FriendStore,PgFriendStore,MemoryFriendStore,VipService,VipStore,PgVipStore,MemoryVipStore}.ts`,
`server/src/social/sql/{friendQueries,vipGroupQueries,vipEntriesQuery}.ts`,
`server/src/chat/ChatHandler.ts`,
`server/src/{GameServer,CharacterHandler,index}.ts`,
`protocol/src/{vip,chat,clientMessages,serverMessages}.ts`,
`client/hooks/useVipSession.ts`,
`client/components/social/{FriendRequestsSection,VipPanel}.tsx`,
`client/components/game-window/{GameCommunityOverlays.tsx,messages/handleCommunityMessage.ts,controllers/GameWindowSessionController.tsx}`,
`client/lib/net/GameClient.ts`, `client/locales/{en,pt-BR}.json`.

**How it was verified.** `FriendService.test.ts` — a request settles into a
friendship on both sides, a forged `fromCharacterId` is refused, presence does
not leak through pending requests, crossing requests settle immediately and
unfriending removes both halves, and the finder switch takes effect at query
time. `PgSocialStores.integration.test.ts` — exactly two friendship rows and
never one, a re-request of an existing friend is refused, VIP groups are
scoped to their owner (another list's group id is refused) and deleting one
ungroups its entries, and the finder switch persists.
`SocialIntentSchemas.test.ts` covers the new bounded intents.

**Residual risk / deferred.**
- **Exiva restrictions** remain blocked: no exiva spell exists yet (todo-8).
- **Ignore lists**: the decision is *server-side*, and it already ships —
  `chat/IgnoreList.ts` suppresses on delivery and tells the speaker nothing,
  which is stricter than pinned Tibia's client-side list. It is memory-only
  and does not survive a restart; making it durable is the open follow-up.
- The client shows friends, requests, and the finder switch; VIP **group**
  management has protocol and server support but no UI yet.
