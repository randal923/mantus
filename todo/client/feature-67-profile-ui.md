# Feature 67 (client) — profile, achievements, and bug reports

Part of the [client backlog](README.md). Server side shipped:
[done.md record](../done.md).

## Why
Achievements, titles, badges, the public character profile, and bug reports
are all live server-side, with exactly-once grants and bounded projections.
The client has **no surface for any of it**: `profile-state`,
`character-profile`, `achievement-granted`, and `profile-action-failed` are
all unhandled, so a granted achievement is invisible and a player cannot see
anyone's profile or file a report.

This is the largest remaining client piece in the batch.

## Remaining work

### Own profile window
- `profile-state` carries every catalog achievement with a `granted` flag
  (so progress is visible), the titles with their granted flags, the badges,
  the selected title, and total points.
- Title selection sends `profile-select-title` with a `titleId` or `null`;
  an ungranted title is refused with `profile-action-failed: not-granted`, so
  ungranted titles must not be selectable in the first place.

### Public profile
- `character-profile-get` by display name; render the `character-profile`
  reply (name, level, vocation, guild, title, points, granted achievements,
  badges).
- Entry point: a "View profile" entry on the player context menu and from the
  VIP/friends list. `not-found` is a normal outcome — a name that does not
  exist — not an error state.

### Achievement toast
- `achievement-granted` arrives at most once per achievement. Show a toast
  with the name and points, reusing the existing toast plumbing in
  `GameNotifications` (see `houseToast` / `vipToast` for the shape).

### Bug report
- A Ctrl+Z modal with the four categories (`bug`, `typo`, `map`, `other`) and
  up to 500 characters.
- The client sends **only** category and text: the reporter and their position
  are server-derived, and the schema rejects a client-supplied position, so do
  not add one.
- Rate limits are one per minute per session and 20 per day, both enforced
  server-side; surface `profile-action-failed: rate-limited` plainly.

## Implementation
- New `client/hooks/useProfileSession.ts` following `useVipSession`; register
  it in `GameWindowSessionController` and add the message branches to
  `handleCharacterSessionMessage.ts` (own state) for `profile-state` /
  `achievement-granted` / `profile-action-failed`, and to
  `handleCommunityMessage.ts` for `character-profile` (someone else's).
- `GameClient` needs `getCharacterProfile(name)`, `selectTitle(titleId)`, and
  `reportBug(category, message)` — none exist yet.
- Components under `client/components/profile/`: one per file
  (`ProfileModal`, `AchievementList`, `TitlePicker`, `PublicProfileModal`,
  `BugReportModal`).
- Locale keys: a new `profile.*` section covering the window, the category
  labels, and `profile.errors.*`. Also add
  `serverErrors.character-namelocked` — see
  [cross-cutting-locales.md](cross-cutting-locales.md).
- Keep the public projection exactly as received. It deliberately omits
  position, health, and online state; do not enrich it from the local
  creature cache, which would reintroduce the over-share the server avoids.

## Tests
- Storybook: own profile with a mix of granted and ungranted achievements
  (checking that ungranted titles are not selectable), and a public profile.
- A unit test for the points/progress summary helper in
  `client/lib/profile/`.

## Dependencies
- Feature 83 (Cyclopedia) displays the same projections — build the list
  components so Cyclopedia can reuse them rather than duplicating.
- Namelock has no rename flow yet (Feature 2); the client only needs the
  error string until that lands.
