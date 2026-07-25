# Feature 67 — Profile projections (achievements, titles, badges, namelocks, character info, casting, bug reports)

Shipped 2026-07-25 — see
[completed/implementation-feature-67-completed.md](completed/implementation-feature-67-completed.md)
for what landed and how it was verified. Only the items below remain.

Client-side work is tracked separately in [client/feature-67-profile-ui.md](client/feature-67-profile-ui.md).

## Remaining work

- Livestream/casting — a spectator-stream feature; its own unit when
  scheduled (also listed under Feature 86's long tail).
- The namelock rename flow — enforcement ships (world entry is refused);
  nothing clears the flag in-game until Feature 2's rename infrastructure.
- Importing Canary's full achievement catalog; today's pinned set covers the
  grant hooks that exist.
- Cyclopedia display of these projections (Feature 83).

## Dependencies

- Feature 83 (Cyclopedia views display these projections).
- Feature 96 (admin tooling issues namelocks).
- Feature 2 (rename flow).
