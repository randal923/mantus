# Feature 1 — completed reconciliations

Feature 1 (the Canary parity ledger) is the umbrella completion contract and
remains **open** — it closes only as every content workstream (Todos 2–22)
closes. This file is the running record of discrete ledger-maintenance work
that has been finished, moved out of [implementation-feature-1.md](../implementation-feature-1.md)
as it lands.

---

## 2026-07-24 — Parity CI + inventory drift from `2e25fa9 add magic rope`

**Problem.** The `2e25fa9` commit changed the spell converter
(`tools/parseCanarySpells.mjs`) and regenerated
`content/spells/canary-spells.json` together, but did not update the ledger's
provenance or the machine inventory. This left `yarn parity:check`
(`.github/workflows/parity.yml`) **red on every push**, and the machine ledger
disagreeing with the spell report.

**Two concrete staleness bugs, both fixed:**

1. `content/source-manifest.json` still pinned the pre-`2e25fa9` sha256 for
   `tools/parseCanarySpells.mjs`, so `verifyCanaryParityInventory.mjs` threw
   `converter tools/parseCanarySpells.mjs differs from its manifest hash`
   before any other check ran. Updated the pin to the committed converter's
   actual hash (`96b1d72a…`). The other 19 converters already matched.
2. `content/canary-parity-inventory.json` was never regenerated after that
   commit, so the two support spells it made executable
   (`data/scripts/spells/support/levitate.lua`,
   `data/scripts/spells/support/magic_rope.lua`) plus their `onCastSpell`
   callbacks were still recorded as `blocked`. Regenerated the inventory from
   the pinned Canary checkout (`/home/randal/code/canary` @ `a879c931`); the
   diff is exactly those 4 entries flipping `blocked → implemented`. The
   inventory's `07-combat` implemented count now reads 153, matching the spell
   report's 153 supported / 83 unsupported.

**Prose reconciled in `implementation-feature-1.md`:** the spell-catalog gap
line no longer calls `canary-spells.json` "uncommitted" or references the
resolved 151/84-vs-153/83 discrepancy; the migration note was turned from a
stale to-do into an accurate status statement (migrations 012–036 confirmed
present; their Canary sources stay `blocked` by design because `blocked` means
"owned by a still-open workstream todo", not "behavior unbuilt").

**Verification.** `yarn parity:check` passes: *verified 6326 Canary sources,
10349 callbacks, and 236 spells*.

**Files touched:** `content/source-manifest.json`,
`content/canary-parity-inventory.json`, `todo/implementation-feature-1.md`.

**Known recurring risk (not yet addressed).** Any future commit that edits a
`tools/` converter without re-running `yarn parity:inventory <canary>` and
bumping the manifest hash will turn parity CI red the same way. The inventory
build needs a local Canary checkout, which CI does not have, so it cannot
self-heal. A guard (pre-commit hook or converter-edit CI warning) belongs to
Feature 100 (testing gates).

---

## 2026-07-24 — Verifier now catches silent inventory-vs-report drift

**Problem.** The drift above was only caught by accident — the stale converter
hash made `parity:check` throw. Had the hash been bumped without regenerating
`canary-parity-inventory.json`, the verifier would have stayed **green with a
stale inventory**: it validated `canary-spells.json` internally and checked
aggregate counts, but nothing tied the inventory's per-spell source/callback
entries back to the spell report. A `supported` spell could read `blocked` in
the inventory (or vice-versa) undetected — precisely the state
`magic_rope.lua`/`levitate.lua` were in before regeneration.

**Fix.** Added a cross-check to `tools/verifyCanaryParityInventory.mjs`: for
every spell, the inventory source entry at its `sourcePath` must have
`status === spell.parity.status`; and for every supported spell, its inventory
callbacks must be `implemented` unless legitimately deferred (`blocked` with
`blockedBy === "15-optional-features"`, matching the build's
`supportedCallbackDependency`). Bumped the verifier's own pinned hash in
`content/source-manifest.json` (it is a hash-pinned converter source).

**Verification.** `yarn parity:check` passes on current data (6326 sources,
10349 callbacks, 236 spells). Reproduced the historical drift (reset
`magic_rope.lua` to `blocked` in a scratch copy of the inventory): the verifier
now fails with `parity inventory source …/magic_rope.lua is stale against the
spell report`, where before it passed. Inventory restored after the test.

**Files touched:** `tools/verifyCanaryParityInventory.mjs`,
`content/source-manifest.json`.

**Residual.** This closes the *silent-drift* half of the recurring risk for the
spell domain. The other half — CI cannot regenerate the inventory (no Canary
checkout) so it still cannot detect a converter that was improved but whose
output was never recommitted — remains open and belongs to Feature 100.

---

## 2026-07-24 — Full-domain reconciliation sweep + creature/NPC drift guards

**Full regeneration proof.** Regenerated every importer that feeds the parity
inventory from the pinned Canary checkout (`/home/randal/code/canary` @
`a879c931`) and diffed against committed: `convertCanaryItems` (37,526 item
semantics), `importCanaryFoods` (133), `importCanarySpells` (236 / 153
supported), `importCanaryCreatures` (911 monsters, 956 NPCs, 84,294 spawns),
`importCanaryNpcs` (949 dialogue baselines, 284 shop catalogs, 8,368 offers).
**Zero content diff** in every domain — the committed ledger inputs are fully
reconciled with the current tools at the pinned commit; no hidden drift exists
anywhere, not just in spells.

**Creature/NPC drift guards.** Extended the verifier's source-vs-report
cross-check (previously spell-only) to the other two domains that carry
per-entry status in the inventory: a `data-otservbr-global/monster/…` source is
`implemented` exactly when the creature report does not list it as unsupported,
`blocked` otherwise; every `data-otservbr-global/npc/…` source stays `blocked`
until an NPC dialogue runtime lands. Bumped the verifier's pinned hash again.

**Verification.** `yarn parity:check` green (6326 sources, 10349 callbacks, 236
spells). Injected both drift shapes into scratch inventories: flipping a clean
monster to `blocked` fails with `parity inventory monster …/deathspawn.lua is
stale against the creature report`; flipping an NPC to `implemented` fails with
`… npc … must stay blocked until the NPC dialogue runtime lands`. Both passed
before the guards. Inventory restored after each test.

**Files touched:** `tools/verifyCanaryParityInventory.mjs`,
`content/source-manifest.json`.

**State of Feature 1's own scope.** The ledger machinery and its reconciliation
with generated state are now complete and self-defending across all three
status-bearing domains (spells, creatures, NPCs). What remains under Feature 1
is *not* ledger work — it is the coverage obligation (83 unsupported spells,
1,867 creature/NPC report gaps, the item/quest/social long tail), which by the
feature's own definition and dependency list is delegated to Features 3–107 and
closes only as those land. Feature 1 stays open as the umbrella contract; there
is no further pure-Feature-1 implementation to do until a delegated todo moves
an entry from `blocked` to `implemented`, at which point the importer + `yarn
parity:inventory` regeneration + these guards keep it honest automatically.
