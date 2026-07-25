# Feature 28 — completed

Cross-links: [todo-8.md](../todo-8.md) · [implementation](../implementation-feature-28.md).

---

## 2026-07-25 — Spell words via chat closed out

**Problem.** Spell words shipped (`4b332a1`, `2e25fa9`) with five recorded
gaps: name-parameterized casts were dropped for ordinary spells, exani hur
could not be bound to an action-bar slot, a successful cast was broadcast as
plain `say`, yelled spell words never cast, and both floor-moving spells
fizzled against the walk cooldown (`player.nextStepAt`) although Canary
teleports on cast.

**What changed.**

- **Name-parameterized casts.** `Combat.castSpellByWords` now resolves a
  spoken parameter for spells whose `targetKind` is `target` /
  `target-or-direction` (Canary's `needTarget` + `hasParams` set) into a
  `{ kind: "creature" }` target. Resolution lives in the new shared
  `server/src/combat/findVisiblePlayerByName.ts`, which
  `PlayerSpellActions.resolveNamedPlayer` now also uses: a candidate must be
  online, in `session.knownCreatureIds`, inside the session's view, and within
  the spell's range. `SpellCaster` re-resolves the creature target again at
  execution time, so an off-screen name can never be confirmed by a cast
  (charter rules 4 and 6). A name that does not resolve fails with
  `spell-parameter-invalid`; trailing words on a spell that takes no parameter
  stay ordinary speech, exactly as Canary's `getInstantSpell` prefix match
  behaves.
- **Speech mode.** `CREATURE_SPEECH_MODES` gained a server-authored `magic`
  mode (players still may only request say/whisper/yell). `ChatHandler` now
  offers the line to the spell pipeline *first* — as Canary's
  `Game::playerSaySpell` does — and broadcasts a successful cast in `magic`
  mode from wherever the caster ended up, so a floor-moving spell speaks from
  its destination. Client renders `magic` in the monster-say orange
  (`speechTone`, `SpeechTextRenderer`).
- **Yelled spell words.** Because the cast attempt now runs before the mode
  branch, yelling a spell casts it and never spends the 30 s yell exhaust,
  matching Canary; the words go out at say range in `magic` mode rather than
  across the yell box.
- **Action-bar exani hur.** `actionBarActionSchema`'s spell variant carries an
  optional bounded `parameter`, passed through `activateActionBarSlot` into
  `cast-spell`. The spell catalog projection gained `parameterKind`
  (`none` / `direction` / `player-name` / `monster-name`, derived server-side in
  `spellParameterKind.ts`), and the new
  `client/components/action-bar/ActionBarSpellParameter.tsx` renders an up/down
  chooser or a bounded name input inside the spell picker.
- **Step-cooldown decoupling.** `MovementRules.tryLevitate` no longer consults
  `nextStepAt`, and magic rope routes through the new
  `trySpellRopeSpot` (`tryUseAction(..., ignoreStepCooldown: true)`) instead of
  the tool's `tryUseRopeSpot`. The rope *item* keeps the walk cooldown. Nothing
  else changed about resource spending: `executeWorldSpell` still attempts the
  move before charging mana/soul, so a failed move stays free.
- **Cast outcomes are now reported.** `SpellCaster.executeSpell` /
  `executeWorldSpell` / `executeConjure` and `Combat.castSpell` return a
  boolean, and `castSpellByWords` returns the new `SpokenSpellOutcome`
  (`no-match` / `cast` / `rejected`) that the chat layer needs to pick a
  speech mode.

**Files touched.**

- `protocol/src/chat.ts`, `protocol/src/combat.ts`, `protocol/src/actionBar.ts`
- `server/src/combat/SpokenSpellOutcome.ts` (new),
  `findVisiblePlayerByName.ts` (new), `spellParameterKind.ts` (new)
- `server/src/combat/Combat.ts`, `SpellCaster.ts`, `SpellRegistry.ts`,
  `PlayerSpellActions.ts`
- `server/src/chat/ChatHandler.ts`
- `server/src/world/MovementRules.ts`, `server/src/World.ts`,
  `server/src/MovementHandler.ts`
- `client/components/action-bar/ActionBarSpellParameter.tsx` (new),
  `ActionBarSpellPicker.tsx`, `client/lib/chat/speechTone.ts`,
  `client/lib/render/SpeechTextRenderer.ts`, client story/test fixtures

**Verification.** `yarn workspace server test` — 835 passed / 183 skipped
(integration suites need a database). New coverage: `Combat.test.ts` (spoken
name parameter casts at the visible player; an unseen name is refused with
`spell-parameter-invalid` and no mana; trailing words stay speech; exani hur
from an action-bar slot), `ChatHandler.test.ts` (cast lines broadcast in
`magic` mode; refused words stay ordinary say; a yelled spell casts without
arming the yell exhaust), `World.test.ts` (levitate and magic rope both move
mid-step; the rope tool still reports `cooldown`), `CombatIntentSchemas.test.ts`
(the cast and action-bar parameters are bounded, empty is rejected).
`yarn workspace client test` — 224 passed. All three workspaces typecheck.

**Residual risk / still open.**

- `parameterKind` is derived from `targetKind`/`playerAction`, not from a
  pinned Canary `hasParams` flag — the spell catalog does not carry one.
  Regenerating `content/spells/canary-spells.json` with `hasParams` (needs a
  Canary checkout) would make the classification exact; today a `needTarget`
  spell Canary declares without params still accepts a name here.
- A refused spell's words are still broadcast as ordinary say. Canary
  swallows them (`TALKACTION_FAILED`). Left as-is deliberately: swallowing
  them would let a player probe which words are spells by watching whether
  their own line appears.
