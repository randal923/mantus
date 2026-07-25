# Feature 33 — progress log

Cross-links: [todo-9.md](../todo-9.md) · [implementation](../implementation-feature-33.md).

This feature is **still open** — spell fields as decaying world items, charge
expiry, and special decay callbacks remain. This log records the sub-work that
is finished.

---

## 2026-07-25 — Carried and equipped items decay

**Problem.** Decay only ran for ground items. Equip/de-equip transform chains
already shipped (`planEquip`/`planUnequip` swap in `transformEquipTo` /
`transformDeEquipTo`), but nothing ever expired the *active* form: an equipped
life ring transformed to id 3089 — which carries the 20-minute duration — and
then burned forever. Torches and perishable food in a backpack never decayed
either.

**What changed.**

- **`DecayManager` gained a carried schedule** next to the world one:
  `CarriedDecayRecord` keyed by item id and owner, its own earliest-deadline
  short circuit, and `collectDueCarried`. `observeMutation` now takes the
  owning `characterId` (passed by `ItemOperationRunner.applyMutation`, which
  already ran on every carried mutation), so equipping arms the deadline and
  de-equipping drops it — Canary's pause falls straight out of the data,
  because only the *active* ring type carries a duration. Items in a corpse or
  world chest have no owner and are deliberately never carried-tracked; they
  decay with their root.
- **`planCarriedDecay.ts`** (new) plans one decay step for a carried item:
  transform into `decayTo`, or destroy the item and everything inside it when
  the target is zero, with `item-transformed` / `item-destroyed` (reason
  `decay`) audits. Identity — id, version, and type — is re-checked against
  live inventory state at execution time, so a stale record for a moved or
  already-transformed item plans nothing.
- **`ItemIntentHandler.tickCarriedDecay`** applies due records inside the tick
  (memory mutation synchronous, row write on the persist lane, viewer told via
  `inventory-updated`), using a new optional `sessionFor` lookup that
  `GameServer` supplies from the session registry.
- **Deadlines survive a logout.** `loadForCharacter` is joined by an optional
  `ItemStore.carriedAgesMs` (`ownedItemAgesQuery`, measured on the database
  clock like Feature 34's world query); `LoadedInventory.agesMs` feeds
  `observeCarriedLoaded`, so a ring resumes with its remaining burn instead of
  refreshing on every login — otherwise relogging would be a free ring.

**Files touched.**

- `server/src/item/DecayManager.ts`,
  `server/src/item/plan/planCarriedDecay.ts` (new),
  `server/src/item/ItemIntentHandler.ts`,
  `server/src/item/ItemOperationRunner.ts`,
  `server/src/item/LoadedInventory.ts`, `server/src/item/ItemStore.ts`,
  `server/src/item/CarriedPersistPlan.ts`,
  `server/src/item/PgItemReads.ts`, `server/src/item/PgItemStore.ts`,
  `server/src/item/sql/ownedItemAgesQuery.ts` (new),
  `server/src/GameServer.ts`
- Tests: `server/src/item/ItemIntentHandler.carriedDecay.test.ts` (new)

**Verification.** `yarn workspace server test` — 877 passed / 183 skipped, up
5 tests: a ring is inert in the bag and burns only once worn, then vanishes
exactly on its deadline (and not a tick early); de-equipping stops the burn
even long past the original deadline and re-equipping arms a fresh one; a
carried item transforms into its decay target with a version bump; a deadline
resumes from the row age instead of restarting; and a character leaving the
world drops their carried deadlines. Existing world-decay and stale-decay
invariants unchanged.

**Residual risk / still open.**

- **Spell fields are still combat-only state.** `CombatFieldManager` holds
  fields in memory with their own expiry and no world item, so nothing renders
  or decays on the ground. Making them real decaying world items (Canary's
  `poison field` id 105 and friends) is the remaining parity step and touches
  combat, world items, and visibility together.
- **Charges are not consumed.** 125 catalog types carry `charges`, but nothing
  decrements them (the absorb path does not spend a charge), so charge-based
  expiry has nothing to expire yet.
- **No special decay callbacks.**
- A carried decay whose owner has no live session is skipped for that tick and
  re-armed from the row age at the next login, rather than being applied
  offline.
