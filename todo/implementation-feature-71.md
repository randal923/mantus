# Feature 71 — Mounts

Shipped 2026-07-25 — see
[completed/implementation-feature-71-completed.md](completed/implementation-feature-71-completed.md)
for what landed and how it was verified. Only the items below remain.

Client-side work is tracked separately in [client/feature-71-mount-rendering.md](client/feature-71-mount-rendering.md).

## Remaining work

- Client rendering of mounted outfits: draw the mount's sprite under the
  rider in `CreatureView`. The sprites exist (mount look types 368-377 are
  ordinary outfit objects) and creature state already carries
  `mountLookType`; the work is the second sprite layer, subject to the
  pattern/layer rules in `client/ASSETS.md`.
- Mount unlock sources, alongside Feature 70's.

## Dependencies

- Feature 70 (outfit/entitlement infrastructure).
