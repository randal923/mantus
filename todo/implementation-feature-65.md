# Feature 65 — Friend-system completion

Shipped 2026-07-25 — see
[completed/implementation-feature-65-completed.md](completed/implementation-feature-65-completed.md)
for what landed and how it was verified. Only the items below remain.

Client-side work is tracked separately in [client/feature-65-vip-groups-and-typing.md](client/feature-65-vip-groups-and-typing.md).

## Remaining work

- Exiva restrictions — still blocked: no exiva spell exists yet (todo-8).
- Durable ignore lists — server-side suppression ships but is memory-only, so
  a restart clears every list. Needs a per-character table loaded at attach.
- VIP-group management UI — protocol and server support ship; the client shows
  friends, requests, and the finder switch but not groups.

## Dependencies

- Feature 56 (party finder consumes visibility rules).
- Chat system (shipped); exiva blocked on the spell catalog (todo-8).
