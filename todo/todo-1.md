# Todo 1 — Canary parity ledger and gates

**Features 1, 89.** The foundation layer shipped (pinned provenance,
offline-only Lua parsing, 54 CI-covered migrations, the machine-readable
parity inventory, per-domain monotonic-ceiling gates — see
[done.md](done.md)). This area is the completion contract: every pinned
player-visible definition reaches a stable status, verified by generated
reports and CI, with Feature 100 (todo-12) as the release gate.

## Feature 1 — Canary parity ledger: content inventory, open workstreams, and release gates

The umbrella content-import obligation the whole ledger hangs off: every
pinned player-visible static definition (spells, items, creatures, NPCs,
world actions, …) must reach a stable status — implemented,
blocked-with-link, or non-content. Generic `unsupported` is a backlog state,
never a completion state. Scope contract: full player/operator-visible parity
for Canary `a879c931` + the pinned OTServBR Global datapack, reimplemented in
project-native TypeScript/zod/Postgres/tick; security may be stricter but
never removes visible behavior.

**Remaining work**

- Inventory and convert every pinned player-visible static definition into
  project-native typed formats. Staged importers may enable a subset first,
  but their reports must retain every omitted entry and its owning todo —
  omission reports never lose entries. Generated output must not require
  Canary or OTClient code at runtime.
- Audited gap counts (2026-07-25): 66 disabled spells / 0 ignored formula
  fields / 47 unreviewed callbacks (todo-5); 1,061 blocked creature fields +
  1 upstream defect (todo-3); 348 disabled map actions + 2,225 unresolved
  transitions (todo-2); 611 procedural NPC entries (todo-7); 38-entry loot
  budget (asset era, todo-6); 313 world-action registrations all classified.
- Open workstreams, each delegating to its owning area: map/movement/zones →
  todo-2; monsters/NPCs/placements/behaviors → todo-3, todo-7; item
  attributes and registered actions incl. fluids/fields/charges/imbuements →
  todo-4, todo-6, todo-8; vocation/progression remainder (blessings,
  training triggers) → Feature 72 in todo-10; spells/runes → todo-5;
  corpse/loot/death → todo-6; speech/channels/talkactions → todo-7;
  economy + store history → todo-8; world actions/events → todo-2; social/
  houses/PVP → todo-9; outfits/mounts/charms/prey/tasks/forge/Wheel/gems/
  proficiency/Cyclopedia/rewards/familiars + long tail → todo-10; quests →
  todo-13; project-native client controls for every implemented system →
  [client backlog](client/README.md).
- Release gates (all unchecked): parity reports reach zero unimplemented
  registered definitions / zero unreviewed procedural callbacks / zero
  silently ignored fields with stable reasons for non-content; each
  workstream carries representative Canary fixtures + aggregate count checks;
  Feature 100 blocks release while any ledger entry is unsupported.

**Implementation**

- The importer pipeline exists in `tools/`: `importCanarySpells.mjs`,
  `importCanaryCreatures.mjs`, `importCanaryNpcs.mjs`, `importCanaryDoors.mjs`,
  `importCanaryFoods.mjs`, `importCanaryHouses.mjs`, `importCanaryShops.mjs`,
  `importCanaryBestiary.mjs`, `convertCanaryItems.mjs`, `convertOtbm.mjs` —
  each with report blocks embedded in outputs. Remaining work is extending
  each importer's supported surface and reconciling reports against
  `content/canary-parity-inventory.json` via
  `tools/verifyCanaryParityInventory.mjs` (CI-enforced to fail on
  missing/ignored/ownerless entries).
- No downloaded Lua is ever executed — only the whitelisted literal subset is
  parsed offline; procedural scripts are reimplemented as reviewed TypeScript.
- Editing any converter requires updating its sha256 in
  `content/source-manifest.json` → `converterSources`, or `yarn parity:check`
  fails.

**Tests**

- Aggregate-count regression per importer (re-import cannot silently reduce
  coverage); CI parity-inventory verification stays green; representative
  Canary fixtures per workstream (release gate).

## Feature 89 — Parity-gate rules and advanced-systems inventory

Full parity needs working rules (no new feature ships client-enforced or
over-sharing) and a generated inventory of everything pinned Canary exposes,
so "done" is checkable rather than vibes.

**Remaining work**

- Working rules (mirrored in `AGENTS.md`, enforced in review — no code):
  every gameplay-affecting control sends an intent; protocol schemas +
  size/rate limits + execution-time revalidation + abuse tests before
  enabling any interactive feature; authorized projections only, never full
  world/bestiary/market/player data.
- Tooling: a generator in `tools/` scanning pinned Canary for
  player/operator-visible systems and protocol opcodes, diffed against
  implemented messages in `protocol/src/`, emitting a checked-in inventory
  artifact. Feeds Feature 1's ledger and scopes Feature 86's long tail
  (todo-10).

**Tests**

- Generator output deterministic for the pinned sha; diff-based CI check
  flags new unimplemented entries.

**Blockers:** the inventory generator needs the pinned Canary checkout.

[Back to overview](README.md)
