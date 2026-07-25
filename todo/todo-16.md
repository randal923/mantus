# Todo 16 — Remaining Canary systems and client polish

These systems are later in implementation order but they are **not optional in final scope** — every pinned Canary system here is required for full parity. Substantial cores already shipped (see [done.md](done.md)): the minimap panel with pre-baked terrain tiles and live markers, account-wide UI settings, bestiary/bosstiary kill tracking with stage-gated projections, the Wheel of Destiny core with exploit-tested allocation and stat threading, the Canary-pinned Gem Atelier + Fragment Workshop, and the first store slice (Mantus Coins + Premium Time). What remains is completing those systems (combat wiring, rule gaps, deliberate deviations), the untouched Canary systems (outfits, mounts, stamina/blessings, prey, hunting tasks, forge, familiars, and the modern-systems long tail), and client polish/performance plus the parity-gate inventory tooling.

## Remaining features

- [ ] **Feature 68 — Minimap completion** — Shipped 2026-07-25; marker icon/text editing remains. See [implementation](implementation-feature-68.md) · [completed](completed/implementation-feature-68-completed.md).
- [ ] **Feature 69 — UI-settings polish** — Reset control and cross-session sync shipped 2026-07-25; the chat/battle-list/spell-bar layouts are stored but those panels are still fixed. See [implementation](implementation-feature-69.md) · [completed](completed/implementation-feature-69-completed.md).
- [ ] **Feature 70 — Outfits and addons** — Entitlements and selection validation shipped 2026-07-25; unlock sources (store/quests/achievements) and the picker UI remain. See [implementation](implementation-feature-70.md) · [completed](completed/implementation-feature-70-completed.md).
- [ ] **Feature 71 — Mounts** — Ownership, validation, and the server-side speed bonus shipped 2026-07-25; client mounted rendering remains. See [implementation](implementation-feature-71.md) · [completed](completed/implementation-feature-71-completed.md).
- [ ] **Feature 72 — Beds, sleep, stamina, training, blessings, regeneration** — Offline systems with abuse-safe server-clock timing and exact Canary persistence (absorbs the old houses beds/sleep item). The pinned blessing catalog, both cost curves and the equipment-loss table landed 2026-07-25 as typed data, along with two death-formula parity fixes; blessing persistence, purchase and consumption plus beds/training triggers remain. See [implementation](implementation-feature-72.md) · [completed](completed/implementation-feature-72-completed.md).
- [ ] **Feature 73 — Charm spending** — Spend earned charm points on runes; server-rolled charm procs in combat. See [implementation](implementation-feature-73.md).
- [ ] **Feature 74 — Prey system** — Prey slots, reroll costs, wildcards, combat/loot/exp bonuses. See [implementation](implementation-feature-74.md).
- [ ] **Feature 75 — Hunting tasks** — Task slots, kill goals, rewards, points (also a Wheel point source). See [implementation](implementation-feature-75.md).
- [ ] **Feature 76 — Boosted creatures/bosses and kill trackers** — Daily server-selected boosts with exp/loot modifiers, kill trackers, boss slots. See [implementation](implementation-feature-76.md).
- [ ] **Feature 77 — Bestiary accepted-limitation fixes** — Party no-damage kill credit, error routing to both modals, cooldown queueing. See [implementation](implementation-feature-77.md).
- [ ] **Feature 78 — Imbuements, item tiers, and Exaltation Forge** — Imbuements, classification/tiering, forge conversions with history, dust/slivers/cores, influenced/fiendish monsters. See [implementation](implementation-feature-78.md).
- [ ] **Feature 79 — Wheel combat wiring (incl. revelation perks)** — Apply already-computed wheel/gem bonuses (mitigation, leech, revelation abilities, spell grants) in combat. See [implementation](implementation-feature-79.md).
- [ ] **Feature 80 — Wheel rule gaps** — Temple-PZ point removal, extra point sources, offline capacity with wheel bonus, boosted skill display. See [implementation](implementation-feature-80.md).
- [ ] **Feature 81 — Gem atelier Canary deviations** — Carried-gold payment, temple reveal restriction, `normal_random` destroy yields, forge-state drop classification, item-ification. See [implementation](implementation-feature-81.md).
- [ ] **Feature 82 — Weapon proficiency and animus mastery** — Proficiency/animus tracking in progression and combat application. See [implementation](implementation-feature-82.md).
- [ ] **Feature 83 — Cyclopedia views** — Character/map/house/item/monster views as bounded authorized read models. See [implementation](implementation-feature-83.md).
- [ ] **Feature 84 — Rewards and loot QoL** — Reward bosses/chests, quick loot + loot containers, stash interaction, daily rewards/streaks. See [implementation](implementation-feature-84.md).
- [ ] **Feature 85 — Familiars, hirelings, and summons** — Ownership, persistence, dialogue, combat behavior, return rules. See [implementation](implementation-feature-85.md).
- [ ] **Feature 86 — Modern-systems long tail** — Hazard, concoctions, difficulty selection, resource balances, podiums, casting, and every other pinned system the parity inventory finds. See [implementation](implementation-feature-86.md).
- [ ] **Feature 87 — Client polish (lighting, sound, input, HUD, modals, settings)** — Lighting/day-night, sound, real hotkey/action-bar persistence, battle-list/HUD, bounded modals, settings persistence. See [implementation](implementation-feature-87.md).
- [ ] **Feature 88 — Client performance budgets and streaming** — Render budgets, GPU sheet-upload hitch fix, region prefetch. See [implementation](implementation-feature-88.md).
- [ ] **Feature 89 — Parity-gate rules and advanced-systems inventory** — Working rules for intents/schemas/projections plus a generated pinned-Canary systems inventory gating parity. See [implementation](implementation-feature-89.md).

[Back to overview](README.md)
