# Feature 37 — completed

Complete typed NpcType data model, from
[implementation-feature-37.md](../implementation-feature-37.md).

Cross-links: [implementation-feature-37.md](../implementation-feature-37.md) ·
[todo-11.md](../todo-11.md) ·
[implementation-feature-39.md](../implementation-feature-39.md).

---

## 2026-07-25 — Every declared NPC behavior field carried typed

**Problem.** `NpcType` carried eight fields; the pinned Canary definitions
declare more. `flags`, `speechBubble`, and `voices` were reported as ignored
assignments on all 956 NPCs, and the six standard `npcType.onX` handler
wirings were reported as procedural callbacks on every interactive NPC — 7,037
callback assignments in total.

**What changed.**

- `server/src/creature/NpcType.ts` — added `description`, `canChangeFloor`
  (Canary `flags.floorchange`, the leash rule for wandering), `profession`
  and `speechBubble` as closed unions, `voices` (typed speech triggers with
  interval/chance/yell), `currencyItemTypeId`, and `shopId`.
- `tools/parseCanaryCreatureContent.mjs` — parses those fields, rejects an
  unknown profession or speech bubble outright, and classifies callbacks:
  pure `npcHandler:onX(...)` delegation and the boilerplate shop callbacks are
  recognized natively and drop out of the report; anything else stays listed.
  A new `report.definitions` index maps every resolved type id to its Canary
  source, so downstream importers select from a stable list.
- `server/src/spawn/loadCreatureContent.ts` — validates the new fields and
  resolves `shopId` from the shop catalogs, failing closed if one NPC owns two.
- Content documents bumped to `formatVersion` 3 (`converters.creatures`);
  `content/npcs/world-npcs.json` and the world import report regenerated.
- `server/src/test/makeNpcType.ts` (new) — one fixture so adding a typed field
  no longer means editing four unrelated test files.

**Files touched.** `server/src/creature/NpcType.ts`,
`server/src/spawn/loadCreatureContent.ts`, `tools/parseCanaryCreatureContent.mjs`,
`tools/importCanaryCreatures.mjs`, `tools/importCanaryNpcs.mjs`,
`content/source-manifest.json`, `content/npcs/world-npcs.json`,
`content/monsters/world-monsters.json`, `content/spawns/*`,
`server/src/test/makeNpcType.ts`, and the four NPC-type test fixtures.

**Result.** NPC `unsupportedDefinitions` in the world import report fell from
956 to 3, ignored assignments from 2,868 to 1, and reported procedural
callbacks from 7,037 to 2. The three that remain are genuinely custom:
`an-old-dragonlord` and `doctor-gnomedix` (`onSay` bodies that write quest
state) and `captain-dreadnought` (`moneyToNeedDonation`).

**How it was verified.** `server/src/spawn/loadNpcTypes.test.ts` (new: speech
triggers/profession/bubble/leash round-trip, shop ownership matches the catalog
set, every profession and bubble the world uses is typed, dialogue and its
travel offers stay on the type), plus the existing creature import report and
parity gate tests. `yarn parity:check` verifies every converter hash except
the pre-existing `importTibiaAssets.mjs` drift documented in `TODO.md`.

**Residual risk.** Quest/storage gates are modelled on dialogue branches
(Feature 40) rather than on `NpcType`, because that is where they have a
consumer; a type-level gate list with no reader would have been speculative.
