# Feature 53 — completed

World-action parity inventory, from
[implementation-feature-53.md](../implementation-feature-53.md).

Cross-links: [todo-13.md](../todo-13.md).

---

## 2026-07-25 — Every pinned registration classified

**Problem.** Handlers had shipped against known Canary behaviours, but nothing
accounted for every pinned action/movement/creature-event registration, so a
silently ignored interaction could hide indefinitely.

**What changed.** `tools/parseCanaryActionRegistrations.mjs` parses each
revscript into its registrations — segmenting at every `name:register()` so a
reassigned local yields separate entries, and flagging loop-built selectors as
`dynamicSelectors` rather than dropping them.
`tools/classifyWorldActionRegistration.mjs` assigns one disposition per entry
from an ordered rule set: explicit per-file dispositions first, then structural
rules (a `uid`/`aid`/`position` selector or a `quests/` path is scripted quest
content), then per-kind fallbacks. There is deliberately no "every id looks
implemented" shortcut — a registration counts as implemented only when its file
is named, so a script reusing a covered id cannot claim parity it does not have.

`tools/buildWorldActionParityInventory.mjs` (`yarn parity:world-actions`) walks
the six trees todo-13 owns and writes
`content/canary-world-action-parity.json`: **313 registrations — 23 implemented,
263 deferred, 27 excluded, 0 unclassified**, each with an owner and a reason.

Two gates consume it. `server/src/action/worldActionParity.test.ts` fails on any
unclassified entry, on a missing owner/reason, on an empty tree, and — most
usefully — when the report's `implementedItemIds` drift from the server's live
tool/clock/lever/plate/trap tables or claim a chest uid range the imported chest
table does not fill. `tools/verifyCanaryParityInventory.mjs` re-checks the
provenance and the counts, so `yarn parity:check` covers it in CI.

**Files touched.** `tools/{parseCanaryActionRegistrations,classifyWorldActionRegistration,buildWorldActionParityInventory,verifyCanaryParityInventory}.mjs`,
`tools/parseCanaryActionRegistrations.test.mjs`,
`content/canary-world-action-parity.json`,
`server/src/action/worldActionParity.test.ts`, `package.json`,
`content/source-manifest.json`.

**How it was verified.** `node --test tools/parseCanaryActionRegistrations.test.mjs`
(3 cases: single registration, reassigned local with a dynamic selector,
uid/position selectors with commented code ignored) and
`worldActionParity.test.ts` (7 cases). The drift gate proved itself immediately:
it caught trap id 2148 missing from the report's table on the first run.

`yarn test:tools` now passes end to end — the pre-existing
`importTibiaAssets.mjs` manifest-hash drift recorded in `TODO.md` was
reconciled in the same pass, along with two more that had drifted unnoticed
(`importCanaryCreatures.mjs`, `importCanaryNpcs.mjs`).

**Residual risk.** The dispositions are rules over paths and selector shapes,
not a semantic diff of each Lua body: a file whose behaviour changes without
moving is still marked by its old disposition. The blob hashes in
`source.sourceTreeSha256` make such a change detectable on the next
regeneration.
