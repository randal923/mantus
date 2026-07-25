# Feature 26 — Spell report zero-disabled gate

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

Shipped 2026-07-25: report classification (non-content vs. registered), the
parity-budget gate, and the determinism check — see the
[completed log](completed/implementation-feature-26-completed.md).

## Why

The generated spell report must reach zero disabled registered spells, zero
disabled runes, zero ignored formula fields, and zero unreviewed callbacks.
State on 2026-07-25: 236 total / 1 non-content / 235 registered / 169
supported / 66 disabled / **0 ignored formula fields** / 47 unreviewed
callbacks.

## Remaining work

Drive the 66 disabled registered definitions to zero. The gate test's
`disabled.byOwner` budget in
`server/src/combat/loadCanarySpellCatalog.test.ts` is the work list; each
owner is a different feature, and none of this work belongs to Feature 26
itself:

| Owner | Disabled | Blocked on |
| --- | --- | --- |
| `07-combat` | 33 | [Feature 24](implementation-feature-24.md) — remaining player support-spell callbacks (Monk harmony/virtue, mass healing, chain/grenade spells) |
| `08c-decay` | 12 | Field, wall and bomb runes need the item-creation and decay path |
| `14a-parties` | 5 | Party spell callbacks (`enchant/enlighten/heal/protect/train party`) |
| `14d-houses` | 4 | House list/kick spell callbacks |
| `14e-social-services` | 2 | `find person`, `find fiend` |
| `15-optional-features` | 10 | Features 55–57, 61–66 — familiars and avatars |

`unreviewedCallbacks` falls out of the same work: it counts the registered
definitions among the above whose Lua body still has no reviewed TypeScript
counterpart.

## Gate

Once a bucket reaches zero, drop its line from `disabled.byOwner` in the gate
test. When all of them are gone, replace the budget with
`expect(report.disabled.total).toBe(0)` and
`expect(report.unreviewedCallbacks).toBe(0)`, alongside the already-locked
`expect(report.ignoredFormulaFields).toBe(0)`.

## Dependencies

Feature 24 (support-spell callbacks), the delegated branches in Todo 15
(Features 55–57, 61–66) and Todo 16 (Features 79–82, 85), the decay work in
Todo 8c, and the Todo 14 party/house/social spell callbacks.
