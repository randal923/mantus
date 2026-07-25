# Feature 55 — completed

Party analyzer, from
[implementation-feature-55.md](../implementation-feature-55.md).

Cross-links: [todo-15.md](../todo-15.md).

---

## 2026-07-25 — Server-computed hunt totals

**Problem.** Hunt parties had no way to split profit: there were no per-member
loot, supply, damage or healing totals.

**What changed.** `PartyAnalyzerTotals` lives on the `Player` instance (like
`CombatAnalyzerTotals`), so totals start at zero on login and disappear with the
player — there is no keyed map to leak. `ItemIntentHandler` gained one narrow
observer pair (`setAnalyzerHooks`) called synchronously right after the server's
own mutation lands: loot from both loot paths (`quick-loot` and `loot-item`),
supplies from rune/ammunition consumption and potion use. Nothing the client
reports reaches a total.

`ItemValuation` prices those counts two ways, chosen by the leader: `npc` uses
the best sell price in the pinned shop catalogs (coin-denominated shops only, so
a token price cannot masquerade as gold), `market` uses the item type's catalog
`worth`. `projectPartyAnalyzer` builds the bounded per-member rows and
`PartyHandler` sends them, on a 2 s cadence, only to current members — a member
who leaves stops receiving them the same tick.

New leader-only intents `party-reset-analyzer` and
`party-set-analyzer-price-mode` re-read leadership at execution time. Client:
`PartyAnalyzerSection` inside `PartyPanel`, wired through `usePartySession`.

**Files touched.**
`server/src/party/{PartyAnalyzerTotals,ItemValuation,projectPartyAnalyzer,PartyHandler,Party}.ts`,
`server/src/{Player,GameServer}.ts`, `server/src/item/ItemIntentHandler.ts`,
`protocol/src/{party,clientMessages,serverMessages}.ts`,
`client/components/party/{PartyAnalyzerSection,PartyPanel}.tsx`,
`client/hooks/usePartySession.ts`,
`client/components/game-window/{GamePartyTradeOverlays.tsx,messages/handleCommunityMessage.ts,controllers/GameWindowSessionController.tsx}`,
`client/lib/net/GameClient.ts`, `client/locales/{en,pt-BR}.json`,
`client/stories/PartyPanel.stories.tsx`.

**How it was verified.** `PartyAnalyzer.test.ts` (7 cases): totals aggregate
from server-recorded events only; the price mode switches the valuation source;
reset and price-mode from a non-leader are refused; a reset clears every
member; a non-member never receives the projection; a member who left stops
receiving it; and a record for a character the world does not hold is dropped
outright, so nothing outside the server's own player set can inject a total.

**Residual risk.** Canary's `market` mode reads live market statistics; ours
uses catalog `worth` until a market price index exists. Supplies count runes,
ammunition and potions — not food or other consumables.
