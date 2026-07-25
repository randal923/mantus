# Feature 70 — completed

Outfits and addons, from
[implementation-feature-70.md](../implementation-feature-70.md).

Cross-links: [todo-16.md](../todo-16.md),
[Feature 71](implementation-feature-71-completed.md).

---

## 2026-07-25 — Server-owned outfit and addon entitlements

**Problem.** Outfit rendering existed in public creature state, but there was
no server-owned record of what a character was entitled to wear. The only
reason nothing could be forged was that the look type was pinned to the two
starter citizen outfits by a column check — i.e. there was nothing to choose.

**What changed.** Making outfits selectable means the *entitlement* becomes
the gate. Migration `053_outfits_and_mounts.sql` adds `character_outfits`
(look type + a 2-bit addon mask, so "owns the outfit" and "owns its addons"
are one row that cannot disagree) and widens the column check to the sprite
range. `characterLookTypeSchema` widened accordingly, while character
*creation* keeps the narrow `starterLookTypeSchema`.

The client sends a request, never a decision. `PgOutfitStore.select` re-reads
ownership **inside the transaction that writes the selection** and refuses
unless the look type is owned and every requested addon bit is a subset of the
granted mask; `OutfitService` additionally refuses anything outside the pinned
catalog before the store is asked. Only a committed result is applied to the
live creature, so an unentitled outfit never enters another player's view.

Grants merge addon bits (`addons | EXCLUDED.addons`), so re-granting an outfit
can never take an addon away, and the starter outfits are back-filled at
attach so characters created before this feature own what they are wearing.

**Files touched.**
`server/db/migrations/053_outfits_and_mounts.sql`,
`server/src/outfit/{OutfitService,OutfitStore,PgOutfitStore,MemoryOutfitStore,outfitCatalog}.ts`,
`server/src/{Player,GameServer,CharacterHandler,index}.ts`,
`server/src/creature/Creature.ts`,
`server/src/character/{Character,CharacterRow,CharacterService,toCharacter,sql/characterColumns}.ts`,
`protocol/src/{outfit,character,creature,index,clientMessages,serverMessages}.ts`,
`client/components/characters/CreateCharacterForm.tsx`.

**How it was verified.** `OutfitService.test.ts` — an unowned outfit is refused
and never reaches the world, a look type outside the pinned catalog is refused
before storage is touched, and an addon bit the grant did not include is
refused while the granted bit is accepted.

**Residual risk / deferred.** Unlock *sources* are the open half: the store
(Feature 43), quests (todo-21), and achievements (Feature 67) each need to call
`OutfitService.grantOutfit`. There is no outfit-picker UI yet; the protocol
(`outfit-get` / `outfit-state` / `outfit-select`) is in place for it.
