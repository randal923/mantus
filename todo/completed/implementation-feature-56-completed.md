# Feature 56 — completed

Party finder, from
[implementation-feature-56.md](../implementation-feature-56.md).

Cross-links: [todo-15.md](../todo-15.md).

---

## 2026-07-25 — Leader adverts and bounded search

**Problem.** Party formation was word-of-mouth only.

**What changed.** Leaders publish an advert (`party-finder-advertise`: a
64-character title plus an optional level range, cleared by omitting the title);
searchers ask for a listing (`party-finder-list`, optionally filtered to their
own level). `listPartyFinderEntries` builds the read model: rows carry the
advert, the leader's name, and the party size — no position, no health, no
roster — and the row count is capped at 40 with a `truncated` flag rather than
paging, so a search can neither leak private state nor return an unbounded
result. Adverts live on the in-memory `Party`, like the rest of the party
system.

Finder visibility is a `finderVisible(characterId)` hook consulted **inside the
query**, not when the advert was published, so a leader who opts out between the
two is not listed. The friend system owns the real setting; until Feature 65
ships, every online leader who advertises is listable.

Client: `PartyFinderSection` inside `PartyPanel`. Browsing is read-only —
joining still goes through the leader's invite, as in Canary.

**Files touched.** `server/src/party/{listPartyFinderEntries,PartyHandler,Party}.ts`,
`protocol/src/{party,clientMessages,serverMessages}.ts`, `server/src/GameServer.ts`,
`client/components/party/{PartyFinderSection,PartyPanel}.tsx`,
`client/hooks/usePartySession.ts`, `client/lib/net/GameClient.ts`,
`client/components/game-window/{GamePartyTradeOverlays.tsx,messages/handleCommunityMessage.ts,controllers/GameWindowSessionController.tsx}`,
`client/locales/{en,pt-BR}.json`, `client/stories/PartyPanel.stories.tsx`.

**How it was verified.** `PartyFinder.test.ts` (8 cases): an advertised party
lists with advert data only; an unadvertised party never lists; visibility is
honoured at query time, not advertise time; the own-level filter works; clearing
the advert unlists it; a non-leader advert and an inverted level range are
refused; the listing caps at 40 and reports the truncation; and the searcher's
own party is omitted.

**Residual risk.** `finderVisible` defaults to true until Feature 65 ships the
privacy setting — coordinate there.
