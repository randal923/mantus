# Parties

Part of [`14-social-and-houses`](14-social-and-houses.md). Depends on stable
character ids, [`combat`](07-combat.md) kill attribution, and
[`progression`](06-progression.md) experience awards.

## Parties

- [x] Add invite/join/leave/kick/leadership and shared-experience intents with
  server-derived character/party ids, membership checks, limits, and rates.
  (Shipped 2026-07-19: `server/src/party/`, `protocol/src/party.ts`,
  `client/components/party/`. In-memory parties, Canary parity: leader-only
  controls, auto-promotion on leader leave/logout, disband-when-empty,
  in-fight leave block.)
- [x] Define visibility/status sharing and experience eligibility by range,
  floor, level spread, combat contribution, and activity. (30×30×1-floor
  status range per recipient, hp/mana nulled out of range; shared exp:
  ceil(highest/1.5) level rule, 30/30/1 from leader, 2-min activity window.)
- [x] Re-check party membership/eligibility when a kill reward executes.
- [ ] Match pinned party analyzer, shared-experience activation, status icons,
  vocation boosts, spell interactions, leader/member finder flows, and
  invite/leadership edge cases.
  - Done: shared-exp activation + status reasons, party shields (gray/blue/
    gold + shared-exp stroke) on nameplates, vocation-diversity boosts
    (1.2/1.3/1.6/2.0), invite/leadership edge cases, party chat channel (`/p`).
  - Deferred: party analyzer (loot/supplies/damage/healing tracker),
    leader/member finder flows, invite-pending shield variants, party-aware
    spell interactions (mass healing etc. — no such spells exist yet).

## Planned file surface

- `server/src/party/` with one main export per file.
- Bounded protocol intents/projections and a focused client panel.

## Required exploit tests

- [x] Party membership/reward races cannot double-award experience.
  (`server/src/party/PartyDeathShares.test.ts`)
- [x] Forged party ids, membership, and status-sharing targets are rejected.
  (`server/src/party/PartyHandler.test.ts`)
- [x] Party status is shared only with current members within the defined
  range/floor rules. (`server/src/party/PartyHandler.test.ts`)

[Back to overview](README.md)
