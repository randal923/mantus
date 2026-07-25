# Feature 67 — completed

Profile projections, from
[implementation-feature-67.md](../implementation-feature-67.md).

Cross-links: [todo-15.md](../todo-15.md).

---

## 2026-07-25 — Achievements, titles, badges, namelocks, bug reports

**Problem.** No achievements, titles, badges, public character profile, or bug
reports existed, and the `namelock` moderation enum value was reserved but
unused.

**What changed.** Migration `051_profiles.sql` adds
`character_achievements`, `character_titles`, `character_badges`,
`characters.selected_title`, `characters.namelocked`, and `bug_reports`.

Grants are exactly-once *by construction*: the primary key is
(character, thing), every grant is an `ON CONFLICT DO NOTHING` insert, and the
row count tells the caller whether **this** call granted it — which is what
makes the "achievement unlocked" push fire once even when a progression event
is replayed or two grant paths race. An achievement and the title it unlocks
are written in one transaction, so a character can never hold one without the
other.

The client never names an achievement. Level milestones are granted by a
periodic sweep over the server's own level values; other systems call
`ProfileService.grant` from their committed outcomes (house purchase and
auction win → `landlord` / `big-spender`, guild creation → `guild-founder`).
Everything resolves through the pinned `achievementCatalog`, so an id outside
it can never be granted.

Title selection validates against the granted rows *inside the update
statement*, so a forged title id updates nothing. The public
`character-profile` projection is deliberately narrow — name, level, vocation,
guild, granted achievements/badges, displayed title — built from the store
rather than any live session, so it reveals neither position nor whether the
character is online.

Namelock sets the durable flag and writes its `moderation_actions` row in one
transaction, and `CharacterHandler` refuses world entry for a namelocked
character: relogging does not clear it. Bug reports are rate-limited per
session *and* by a durable daily cap, and the reporter and their position are
server-derived — the client supplies only the text.

**Files touched.**
`server/db/migrations/051_profiles.sql`,
`server/src/profile/{ProfileService,ProfileStore,PgProfileStore,MemoryProfileStore,achievementCatalog}.ts`,
`server/src/profile/sql/profileQueries.ts`,
`server/src/moderation/{ModerationService,ModerationStore,PgModerationStore,MemoryModerationStore,ModerationCommandHandler}.ts`,
`server/src/character/{Character,CharacterRow,CharacterService,toCharacter,sql/characterColumns}.ts`,
`server/src/{CharacterHandler,GameServer,index}.ts`,
`server/src/house/HouseService.ts`, `server/src/guild/GuildService.ts`,
`protocol/src/{profile,index,clientMessages,serverMessages}.ts`.

**How it was verified.** `ProfileService.test.ts` — a level milestone grants
exactly once across three sweeps (and level 50 clears both milestones, once
each), an ungranted title is refused, the public profile carries only granted
achievements and exactly the nine public fields, and bug reports are
rate-limited before storage. `ProfileIntentSchemas.test.ts` bounds every new
intent, including rejecting a client-supplied bug-report position.

**Residual risk / deferred.**
- **Casting (spectator streams)** is not implemented; per the plan it is its
  own unit and is also listed under Feature 86's long tail.
- The **rename flow** a namelock forces is Feature 2; today the character is
  simply held out of the world with `character-namelocked`, which is the
  enforcement half. Nothing clears the flag in-game yet.
- The achievement catalog is a small pinned set wired to the hooks that exist
  today; importing Canary's full achievement list is content work.
- Cyclopedia display of these projections is Feature 83.
