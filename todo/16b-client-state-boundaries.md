# Client state boundaries and resource bounds

Part of [`16-client-resilience`](16-client-resilience.md). Build continuously
as authoritative features land.

## Client state boundaries

- [ ] Keep server entities keyed by stable ids/revisions; do not let Pixi display
  objects become the source of gameplay state.
- [ ] Separate connection/domain state from rendering and React panels. Derive
  views without effect-driven copies where possible.
- [ ] Bound map-region, message, effect, battle-list, and container caches and
  dispose Pixi resources/listeners deterministically.
- [ ] Surface rejected intents and authoritative corrections without leaking
  server internals.

## Required tests

- [ ] Cache/resource counts stay bounded through repeated region/floor changes.
- [ ] Rejected intents and corrections produce the intended UI without exposing
  server internals.

[Back to overview](README.md)
