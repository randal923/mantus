# Feature 62 — House access lists (Canary syntax, per-door)

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

Server side shipped 2026-07-25 — see
[completed/implementation-feature-62-completed.md](completed/implementation-feature-62-completed.md).
Only the client surface below remains.

## Remaining work

- Per-door list editing has no client surface: `house-set-list` accepts
  `kind: "door"` and the server enforces those lists, but nothing in the
  client can create or edit one. Tracked in
  [client/feature-62-door-list-editor.md](client/feature-62-door-list-editor.md).

## Dependencies

- Guilds (shipped, old todo 14b core).
