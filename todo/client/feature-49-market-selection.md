# Feature 49 (client) — keep the market selection across refreshes

Part of the [client backlog](README.md). Server side shipped:
[done.md record](../done.md).

## Why
After a `market-transacted` push the client re-requests all item-list pages
sequentially, so a selected item that lives on page > 1 briefly falls back to
the first item while its page is in flight. Cosmetic, but it makes the order
book feel broken exactly when a fill just happened.

## Remaining work
- Keep the prior selection rendered from the cached rows until the refreshed
  page containing it arrives; only then reconcile (or clear it if the type
  vanished from the listing).
- Do not reorder or jump the scroll position during the refresh.

## Implementation
- `client/components/auction/` — the selection lives with
  `AuctionHouseModal.tsx` / `AuctionItemBrowser.tsx`; the refresh loop is the
  page re-request path. Hold `{ typeId, page }` for the active selection and
  treat the stale cache as valid display data until replaced.
- No protocol change; this is purely client state sequencing.

## Tests
- Store/unit test: a `market-transacted` refresh with the selection on page 2
  keeps the selection until page 2 lands; a selection whose type disappears
  clears cleanly.

## Dependencies
None. The full marketable-catalog browser is **not** this file — it is blocked
server-side on `ATTR.market` (see
[Feature 49 in todo-8](../todo-8.md)).
