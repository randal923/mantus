# Feature 79 — Wheel combat wiring (incl. revelation perks)

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
The Wheel core computes bonuses correctly (`WheelBonuses`) and gems compute theirs (`computeGemBonuses`), but large parts are combat-inert: players see the numbers without the effects. This is the biggest wheel-parity gap.

## Remaining work
- Combat application of: mitigation multiplier, life/mana leech, magic skill boost, revelation flat damage/healing.
- Conviction instants (Battle Instinct etc.).
- Spell grants/augments from wheel allocation.
- Revelation abilities (Gift of Life, Avatars, Beam Mastery, ...).
- Gem overlap: supreme spell augments, dodge, crit damage, gem leech/mitigation mods are displayed but combat-inert.

## Implementation
- Thread `WheelBonuses`/`computeGemBonuses` outputs into `server/src/combat/Combat.ts`, `DamageResolver`, `SpellCaster.ts`/`SpellRegistry.ts` (spell grants/augments), and the healing paths.
- Revelation abilities implemented as server-side effects (avatar transforms, Gift of Life trigger, Beam Mastery area changes) with server RNG where rolls exist.
- Bonuses read from the server-owned allocation at execution time each tick/cast — never from client claims (charter rules 1, 4, 8).
- Canary reference for exact formulas and revelation thresholds.

## Tests
- Every bonus is applied at execution from the server-owned allocation; a client claiming bonuses it hasn't allocated changes nothing.
- Spell grants appear/disappear with allocation changes at execution time.
- Gem mods (dodge, crit damage, leech, mitigation) verified active in damage resolution.

## Dependencies
- Wheel core + gem atelier (both shipped).
- Spell/combat systems (todo-7/8).
