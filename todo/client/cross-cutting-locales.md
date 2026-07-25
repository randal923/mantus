# Cross-cutting — missing locale keys and error surfaces

Part of the [client backlog](README.md). Covers Features 62, 65, 66, 67, 70.

## Why
Several failure reasons the server can now send have no translation, so they
fall through to a generic "Sorry, not possible." — or, for `sendError` codes,
to `serverErrors.unknown`. The paths themselves already work; only the wording
is missing, which makes real refusals look like bugs.

## Remaining work

Add to **both** `client/locales/en.json` and `client/locales/pt-BR.json`:

- `vip.errors.already-friends`, `vip.errors.request-pending`,
  `vip.errors.request-not-found` — new `vipActionFailedMessageSchema` reasons
  from Feature 65. The existing six keys are present; these three are not.
- `serverErrors.character-namelocked` — Feature 67 refuses world entry for a
  namelocked character with this code; today it renders as "unknown".
- `mail.errors.rate-limited` — Feature 66's mail cap. The other seven
  `mailActionFailedMessageSchema` reasons are already translated under
  `mail.errors`.
- `house.errors.list-too-long`, `house.errors.not-a-door` are already added;
  no action.
- A new `profile.*` section and a new `outfit.*` section — see
  [feature-67-profile-ui.md](feature-67-profile-ui.md) and
  [feature-70-outfit-picker.md](feature-70-outfit-picker.md), which own their
  own key lists.

## Implementation
Keys only. Keep the two locale files structurally identical; the repo has no
lint for divergence, so add both in the same edit.

## Tests
None beyond the existing type check. A missing key degrades to the fallback
rather than throwing, which is exactly why this is easy to leave broken —
eyeball each new reason once in-game.
