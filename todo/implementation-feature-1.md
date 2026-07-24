# Feature 1 — Canary parity ledger: content inventory, open workstreams, and release gates

Part of [Todo 1 — Foundations and Canary parity ledger](todo-1.md).

## Why
This is the umbrella content-import obligation the whole parity ledger hangs off: every pinned player-visible static definition (spells, items, creatures, NPCs, world actions, etc.) must reach a stable status — implemented, blocked-with-link, or non-content. Generic `unsupported` is a backlog state, never a completion state. Scope contract: full player/operator-visible parity for Canary `a879c931` + the pinned OTServBR Global datapack, reimplemented in project-native TypeScript/zod/Postgres/tick; security may be stricter but never removes visible behavior.

## Remaining work
- Inventory and convert every pinned player-visible static definition into project-native, typed formats.
- Staged importers may enable a subset first, but their reports must retain every omitted entry and its owning parity TODO — omission reports must never lose entries.
- Generated output must not require Canary or OTClient code at runtime.
- Audited gap counts (spot-checked against current code):
  - Spell/rune catalog: uncommitted `content/spells/canary-spells.json` reports 236 total / 153 supported / 83 unsupported (recent combat work enabled ~2 more vs the ledger's 151/84). Unsupported reasons (overlapping counts): 79 unsupported/missing combat formula, 56 unsupported/missing combat type, 53 procedural cast callbacks, 23 condition-mechanics, 18 procedural combat callbacks, 9 field/item creation, plus AREA_BALANCED_BRAWL, AREA_RING1_BURST3, one dynamic combat area, one missing literal Spell declaration, one example definition. Every registered spell/rune must become executable.
  - Creature import report: 1,853 definitions with ignored fields or procedural callbacks, plus duplicate/ambiguous definitions and invalid placements needing individual resolution.
  - Item long tail incomplete: item use, containers, fields, decay, imbuements, forge behavior, world actions, economy integration.
  - NPC dialogue/actions, quests, raids, global events, and most persistent social/modern systems lack full project-native runtimes.
- Open workstream checkboxes, 11 of 12 (each delegating to its owning todo):
  - Map/movement/zones/floor transitions/teleports/diagonal/pushing/movement actions → [Todo 3](todo-3.md), [Todo 13](todo-13.md).
  - Monster/NPC definitions, placements, behaviors, callbacks, summons, voices, loot links, bestiary/bosstiary, forge/reward classification, spawn rules → [Todo 5](todo-5.md) (Features 9-10), [Todo 11](todo-11.md).
  - Every item attribute and registered item action incl. depot/inbox/mail/stash, readables, food/fluids, fields, decay/transforms, beds, rewards, quick loot, browse/seek, inspection, wrapping, hotkey equip, imbuements, forge tiers, equipment effects → [Todo 6](todo-6.md), [Todo 9](todo-9.md), [Todo 12](todo-12.md).
  - Vocations/promotions, skill/magic curves, regen, stamina, soul, offline/exercise training, blessings, death loss → [Todo 7](todo-7.md), [Todo 9](todo-9.md).
  - Every spell/rune with exact requirements/formulas/areas/callbacks/conjuring/conditions/fields/summons/party/familiar/house/support behavior → [Todo 8](todo-8.md).
  - Corpse/loot/reward-chest/quick-loot/kill attribution/exp share/reward-boss/player-death → [Todo 9](todo-9.md).
  - Speech modes, channels, PMs, NPC speech, talkactions, mute/ignore, channel permissions → [Todo 10](todo-10.md).
  - NPC dialogue/shops/travel/quest gates as reviewed TypeScript → [Todo 11](todo-11.md).
  - Bank/shops/depot/mail/stash/trade/market/escrow/store + history → [Todo 12](todo-12.md).
  - Actions/movements/creature events/map scripts → [Todo 13](todo-13.md); global events/raids/schedules → [Todo 14](todo-14.md); quest lines/storages/rewards → [Todo 21](todo-21.md).
  - Parties/analyzers/shared exp, guilds/wars, PVP/skulls, houses, VIP, highscores, reports/moderation, friend/finder, typing/presence, exiva privacy → [Todo 15](todo-15.md).
  - Outfits/addons, mounts, familiars, hirelings, achievements, titles, badges, attached effects, bestiary/bosstiary, charms, prey, hunting tasks, boosted, daily rewards, Cyclopedia, supply stash, imbuements, forge, Wheel/gems, weapon proficiency, animus mastery, hazards, concoctions, encounters, podium, livestreaming, modal interactions → [Todo 16](todo-16.md).
  - Project-native client controls + authorized projections for every implemented system.
- Release gates (all unchecked):
  - Parity reports reach zero unimplemented registered definitions / zero unreviewed procedural callbacks / zero silently ignored fields, with stable reasons for non-content.
  - Each workstream gets representative Canary fixtures + aggregate count checks.
  - Feature 100 (testing gates) blocks release while any ledger entry is unsupported or inventory/output differ.
- Ledger prose is stale for several social/economy systems — migrations 012 bank, 013 shops, 015 depot/inbox, 016 market, 017 guilds, 018 pvp, 019 houses, 020 social, 027 wheel, 028 gem atelier already exist; reconcile the ledger text against actual schema state.

## Implementation
The importer pipeline already exists in `tools/`: `importCanarySpells.mjs`, `importCanaryCreatures.mjs`, `importCanaryNpcs.mjs`, `importCanaryDoors.mjs`, `importCanaryFoods.mjs`, `importCanaryHouses.mjs`, `importCanaryShops.mjs`, `importCanaryBestiary.mjs`, `convertCanaryItems.mjs`, `convertOtbm.mjs` — with report blocks embedded in outputs (e.g. `content/spells/canary-spells.json` carries a `report` object with per-reason unsupported counts). Remaining work is extending each importer's supported surface and reconciling reports against `content/canary-parity-inventory.json` via `tools/verifyCanaryParityInventory.mjs` (built by `tools/buildCanaryParityInventory.mjs`, CI-enforced to fail on missing/ignored/ownerless entries).

This feature stays open until every domain importer's report reaches zero unowned omissions; each domain's actual runtime work lives in its own todo file (see delegation list above). Satisfied by completing the delegated todos and keeping `tools/verifyCanaryParityInventory.mjs` + per-importer reports green. No downloaded Lua is ever executed during imports — only the whitelisted literal subset is parsed offline; procedural monster/NPC scripts require TypeScript reimplementation.

## Tests
- Aggregate-count regression checks so a re-import cannot silently reduce coverage (per importer).
- CI parity-inventory verification stays green: no missing, ignored, or ownerless entries.
- Representative Canary fixtures per workstream (release gate).

## Dependencies
- Completed incrementally by every content workstream: Features 3-4 (map), 9-10 (creatures), 11-17 (items), 18-20 (progression), 21-28 (combat/spells), 29-34 (death/loot/decay), 35-36 (chat), 37-42 (NPCs), 43-49 (economy), 50-53 (world actions), 54 (world events), 55-67 (social/houses), 68-89 (remaining systems), 103-105 (quests).
- Feature 89 (parity-gate tooling) and Feature 100 (testing gates) enforce the release gates.
