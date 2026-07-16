# Parties

Part of [`13-social-and-houses`](13-social-and-houses.md). Depends on stable
character ids, [`combat`](07-combat.md) kill attribution, and
[`progression`](06-progression.md) experience awards.

## Parties

- [ ] Add invite/join/leave/kick/leadership and shared-experience intents with
  server-derived character/party ids, membership checks, limits, and rates.
- [ ] Define visibility/status sharing and experience eligibility by range,
  floor, level spread, combat contribution, and activity.
- [ ] Re-check party membership/eligibility when a kill reward executes.

## Planned file surface

- `server/src/party/` with one main export per file.
- Bounded protocol intents/projections and a focused client panel.

## Required exploit tests

- [ ] Party membership/reward races cannot double-award experience.
- [ ] Forged party ids, membership, and status-sharing targets are rejected.
- [ ] Party status is shared only with current members within the defined
  range/floor rules.

[Back to overview](README.md)
