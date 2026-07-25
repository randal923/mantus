# Feature 62 — completed

House access lists (Canary syntax, per-door), from
[implementation-feature-62.md](../implementation-feature-62.md).

Cross-links: [todo-15.md](../todo-15.md).

---

## 2026-07-25 — Text lists with `@guild`, wildcards, and per-door lists

**Problem.** Access was limited to explicit per-character invitations. Canary
controls house access with free-text lists supporting `@guild` / `rank@guild`
entries and `*`/`?`/`!` wildcards, plus separate per-door lists.

**What changed.** Three pure files carry the logic: `parseHouseAccessList`
turns a bounded body into inert match data (comments, over-long lines, and
lines past the cap are skipped; regex metacharacters in a name are escaped so
only `*`/`?` stay wildcards, which also means no nested quantifiers and no
catastrophic backtracking), `matchesHouseAccessList` evaluates it, and
`HouseAccessList` holds the shapes.

Guild entries are stored as **names**, never as a membership snapshot.
`HouseService.subjectFor` builds the subject fresh on every check from the live
player plus `GuildService.guildIdentityOf`, whose cache is refreshed from every
guild store outcome — so leaving the guild blocks the very next step or door
use. Wildcard order follows Canary: the first matching pattern decides, so a
`!`-prefixed deny above a broad allow wins.

`house_lists` (migration `047_house_lists.sql`) stores one body per
(house, kind, door tile); kind 2 is the per-door list, and a DB constraint
keeps the two house-wide kinds on the 0/0/0 sentinel tile. The new
`house-set-list` intent is bounded by zod before the parser ever sees the text,
and the store re-checks authorization inside its transaction — subowners may
curate the guest and door lists but never the subowner list. A new tenancy
starts with empty lists: transfer deletes them alongside the invitation rows.

World actions on house tiles now go through `canUseHouseDoor`, which requires
house-wide access *and* the door's own list when it has one; owners and
subowners always pass.

**Files touched.**
`server/db/migrations/047_house_lists.sql`,
`server/src/house/{HouseAccessList,parseHouseAccessList,matchesHouseAccessList,HouseRegistry,HouseService,HouseStore,PgHouseStore,MemoryHouseStore,projectHouseStateFor}.ts`,
`server/src/house/sql/{houseListRowsQuery,houseListRowsForHouseQuery,upsertHouseListQuery,deleteHouseListQuery,deleteHouseListsAllQuery,countHouseDoorListsQuery}.ts`,
`server/src/guild/GuildService.ts`, `server/src/GameServer.ts`,
`protocol/src/{house,clientMessages}.ts`,
`client/components/house/{HouseTextListSection,HouseModal}.tsx`,
`client/components/game-window/GameCommunityOverlays.tsx`,
`client/lib/net/GameClient.ts`, `client/locales/{en,pt-BR}.json`.

**How it was verified.** `parseHouseAccessList.test.ts` — comments, exact
names, `*`, `@guild` vs `rank@guild`, deny-before-allow ordering, metacharacter
escaping, over-long and over-count line caps. `HouseService.test.ts` — guild
access revoked the moment the guild is left, per-door list enforced
independently of the house-wide list, door list refused for a tile outside the
managed house. `HouseIntentSchemas.test.ts` — oversized body and malformed door
position rejected. `PgHouseStore.integration.test.ts` — owner/subowner edit
authorization, empty body deletes the row, door-list cap.

**Residual risk.** Canary's `AccessList::parseList` has a long-standing
off-by-one that truncates the last character of a rank name in `rank@guild`.
We implement the documented behaviour (`rank@guild` matches the full rank
name), per the rewrite boundary's "match player-visible behaviour" rule.
Per-door lists are editable only through the intent; there is no in-game
door-side UI yet — the client editor covers the two house-wide lists.
