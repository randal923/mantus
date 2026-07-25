# Feature 66 — Social-services hardening (GM exclusion, mail rate limit, admin reachability)

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

Server side shipped 2026-07-25 — see
[completed/implementation-feature-66-completed.md](completed/implementation-feature-66-completed.md).

## Remaining work

- `mail.errors.rate-limited` has no translation, so the new mail cap renders
  as a generic failure. Tracked in
  [client/cross-cutting-locales.md](client/cross-cutting-locales.md).
- Setting `accounts.is_staff` needs operator tooling; it is direct SQL until
  Feature 96 lands roles, at which point derive it from the role column rather
  than maintaining two truths.

## Dependencies

- Feature 96 (admin tooling / staff roles).
