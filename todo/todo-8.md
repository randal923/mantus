# Todo 8 — Combat, spells, and conditions

The combat core shipped: bounded intents with execution-time re-checks, server-owned formulas/RNG, full monster-spell parity (all 171 registered monster-spell names resolved to reviewed TypeScript), conditions, potions, monster combat AI, action bars, and — most recently (`4b332a1` spell-in-chat, `2e25fa9` magic rope) — spell words castable via chat plus exani tera/exani hur as `worldAction` spells resolved by movement rules (see [done.md](done.md)). What remains is two missing spell icons, advanced targeting systems, the last player support-spell callbacks, custom combat areas, the spell-report zero-disabled gate (currently 236 total / 166 supported / 70 unsupported), action-bar polish, and the recorded gaps in spell-words-via-chat.

## Remaining features

- [x] **Feature 21 — Potion sound and target monster-say** — the target now says `Aaaah...` via the new `monster-say` creature-speech mode, scoped to observers who see the drinker; the potion sound was dropped by decision and any future audio belongs to Feature 87. **Done 2026-07-25** — see [completed log](completed/implementation-feature-21-completed.md).
- [ ] **Feature 22 — Spell artwork for Blank Rune and Conjure Royal Star** — client-only icon gap; pinned OTClient data lacks valid indices for these two (re-verified 2026-07-25 against `bdea0b2`). Blocked externally. See [implementation](implementation-feature-22.md).
- [ ] **Feature 23 — Advanced targeting and encounter interactions** — follow, challenge/taunt, aim-at-target and the combat analyzer shipped 2026-07-25 ([log](completed/implementation-feature-23-completed.md)); boss difficulty, hazard and encounters stay with Todo 16 Feature 86, and the client panels plus the reward-boss guard are still open. See [implementation](implementation-feature-23.md).
- [ ] **Feature 24 — Remaining player support-spell callbacks** — thirteen callbacks shipped 2026-07-25, 153 → 166 supported ([log](completed/implementation-feature-24-completed.md)); the Monk harmony/virtue subsystem, the field/wall runes' item-creation path, and the spells needing new condition types remain. See [implementation](implementation-feature-24.md).
- [ ] **Feature 25 — Custom combat areas for disabled player spells** — custom tile matrices and direction-dependent areas representable without runtime Lua. See [implementation](implementation-feature-25.md).
- [ ] **Feature 26 — Spell report zero-disabled gate** — the generated spell report must distinguish non-content from registered gameplay definitions and reach zero disabled entries. See [implementation](implementation-feature-26.md).
- [ ] **Feature 27 — Action-bar polish** — accepted gaps (2026-07-20): ignored acks, debounced saves that can lose edits, spell-only slots. See [implementation](implementation-feature-27.md).
- [ ] **Feature 28 — Spell-words-via-chat completion** — accepted gaps (2026-07-24): name-parameterized casts, exani hur from the action bar, speech mode, yell, step-cooldown fizzles. See [implementation](implementation-feature-28.md).

[Back to overview](README.md)
