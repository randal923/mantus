# Todo 4 — Items and inventory

**Features 11, 16, 17, 108.** The core item system shipped: typed pinned catalog,
single-owner `items` table with audited transactions, bounded intents with
execution-time re-checks, memory-first ops with guarded single-transaction
persistence, the optimistic drag queue, the dupe/race/replay exploit suite,
200 ms use exhausts, trash holders, walk-then-use, and the crash harness
(see [done.md](done.md)).

## Feature 11 — Typed world-interaction behaviors (delegated umbrella)

Interactive map objects were imported from Lua-scripted content; each
behavior must exist as a typed server behavior — imported Lua is never
executed. Ownership split (delegated): fields/decay → todo-6; corpse/reward
containers, quick loot → todo-6/todo-10; depots/mail/stash/market/trade →
todo-8; doors/keys/beds/switches/quest actions → todo-2 and todo-13; house
items → todo-9; forge/imbuements/show-off → todo-10.

**Direct gaps owned here**

- Container sorting; browse-field/seek/parent-container navigation; richer
  target selection.
- **Fluids — blocked on three prerequisites** (assessed 2026-07-25). Pinned
  behavior is `data-otservbr-global/scripts/actions/other/fluids.lua`
  (192 lines, 21 container ids: 2524, 2873–2885, 2893, 2901–2904, 3465,
  3477–3480) with five arms: pour between containers, fill from a
  `fluidsource` tile, drink from self (drunk/poison conditions,
  `addMana(50–150)` mana fluid, `addHealth(60)` life fluid, per-fluid `say`),
  empty to a decaying splash pool (2886 carrying the subtype), plus two
  scripted specials (26076 basin, actionid-2023 gravestone teleport).
  Missing first:
  1. `ItemType.fluidSource` — zero catalog types carry it;
     `tools/convertCanaryItems.mjs` doesn't parse `fluidsource` from
     `items.xml` (importer change + full catalog rebuild — the rebuild is
     owned by Feature 108 below).
  2. A fluid-subtype model on carried items — `Item` has `count` +
     `attributes`; must not conflict with
     `server/src/economy/shopSubtypeAttributes.ts`.
  3. `use-item-with` target kinds beyond `targetPosition` (carried item,
     self) — new bounded protocol kinds first (schema + size + rate, per
     charter). Shared prerequisite with Feature 51's non-tile tool targets.
  The drunk condition and splash-pool decay already exist; sequence: catalog
  field → subtype model → protocol target kinds → `handleFluidUse` + exploit
  tests.

**Implementation:** behaviors hook into
`server/src/item/ItemIntentHandler.ts` and the planners under
`server/src/item/plan/`; catalog properties in `server/src/item/ItemType.ts`;
fluids/browse-field need new plan files plus bounded zod intents defined in
`protocol/` before handlers. All checks re-run at execution time inside the
tick.

**Tests:** out-of-reach/forged-id fluid use rejected; browse-field cannot
enumerate tiles out of view; concurrent sort/move races leave item sets
intact.

## Feature 16 — Optimistic-queue and persistence-path refinements

Umbrella ledger of accepted limitations, each with a recorded fix (throw/drop
LOS lock and the nonce echo already shipped). Engineering quality, not
parity-gating — except the `THROW_RANGE` bullet, which is player-visible
Canary behavior.

**Remaining work**

- `use-item`/`open-container` send immediately and get `item-action-failed`
  if they race a queued drag.
- Picked-up items appear in the backpack only on server confirm — no
  clientId→sprite/tooltip catalog for placeholder prediction; pickup costs
  ~8–10 sequential queries.
- Merge prediction guesses stackability client-side (assumes max stack 100);
  tile previews never predict world-stack merges.
- An explicit 7-tile `THROW_RANGE` distinct from view range is still open
  (LOS shipped; strict destination-walkability is deliberately absent — it
  would reject trashholder tiles, which must accept-then-destroy).
- Only `PgItemStore.moveToContainer`/`moveWorldItem` use the combined-CTE
  pattern; `equip`/`unequip`/`pickup`/`drop` run ~8 sequential queries —
  apply the CTE pattern if confirm latency matters.
- `itemFromRow`/`locationFromRow`/`isAttributes` + the row interface are
  duplicated between `server/src/item/` and `server/src/depot/` — dedupe
  deliberately (the depot variant's location handling differs subtly).
- The single global persist lane (`ItemIntentHandler.persistChain`) is a
  throughput bottleneck against a remote DB; if saturated, split into
  dependency-aware lanes (per-character + per-world-item) — never revert to
  DB-first.
- Retired DB-first ops (`PgEquipmentOps`, `PgContainerMoveOps`, `PgStackOps`,
  `PgItemUseOps.writeText`, `PgWorldItemOps.pickup/drop/moveWorldItem`,
  `MemoryItemStore` mirrors + tests) remain as parity reference — remove
  after the memory-first path soaks; do not call them.
- `useOptimisticInventory` prediction is redundant for converted ops —
  removal is a standalone client-only simplification.
- Shop-sell has no client ownership precheck (accepted); the pickup capacity
  precheck ignores ground-container contents; `usedWeight` not adjusted by
  queued ops (errs safe).

**Tests:** CTE-converted ops keep the single-owner/race exploit tests green.

## Feature 17 — Pinned Canary item-parity gate

Item parity is done only when every registered item/move/action behavior is
inventoried and implemented and reports reach zero silently ignored gameplay
attributes.

**Remaining work**

- Inventory and implement all player-visible item semantics: containers,
  fluids, food, readable/writeable, doors, keys, beds, fields,
  decay/transforms, reward containers, stash/mail/depot rules, equipment
  modifiers, charges, imbuement slots, forge tiers, quick-loot configuration,
  browse-field/seek/parent actions, inspection, wrapping, hotkey equip,
  show-off sockets, special-use callbacks.
- Reports must distinguish non-content/reserved ids from gameplay items so
  the zero target is meaningful.

**Implementation:** extend `tools/buildCanaryParityInventory.mjs` /
`tools/verifyCanaryParityInventory.mjs` against
`content/canary-parity-inventory.json`; per-behavior work lives in the
delegated areas — this feature owns the inventory tooling and the gate test
(zero-unreviewed entries, deterministic re-runs against the pinned checkout),
following the creature-gate pattern (Feature 10).

## Feature 108 — Asset/catalog regeneration pass (single owner)

Five features are blocked on flag families the import pipeline currently
parses-and-drops (or never parses). Re-emitting `objects.json` + atlases
rewrites every client asset, so this ships as **one** coordinated
regeneration, never five separate rebuilds:

- `fluidsource` from `items.xml` via `tools/convertCanaryItems.mjs` →
  Feature 11's fluids (this file). The source is the pinned Canary
  checkout, not the DAT — check whether this family can rebuild without
  the external assets and unblock fluids early.
- DAT `multiUse`/`usable` bits → Feature 51's curated tool list (todo-2).
- DAT `m_transformOnUse` / `ignoreLook` → Feature 52 (todo-2).
- DAT `ATTR.market` metadata → Feature 49's catalog browser (todo-8).
- `ItemType.field` payloads → Feature 50's fields (todo-2).

**Blockers:** the pinned `Tibia.dat`/`.spr` live outside the repo (README
known blocker 2) — the DAT-derived families wait until they are supplied.

**Implementation:** extend `tools/importTibiaAssets.mjs` /
`convertCanaryItems.mjs` to emit all five families in the same run
(`yarn assets:import`, `yarn items:convert`, then the `items:catalog`
chain); update converter hashes in `content/source-manifest.json` or
`yarn parity:check` fails; run the full map chain afterwards —
`convertOtbm` alone wipes the minimap PNGs.

**Tests:** aggregate-count regression — the regenerated catalog may not
lose types or flags relative to the shipped one; every shipped-handler
suite stays green (`WorldActionRegistry.test.ts`, per Feature 52's note);
each dependent feature's fixtures activate only as its flag family lands.

[Back to overview](README.md)
