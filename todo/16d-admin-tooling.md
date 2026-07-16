# Administration tooling

Part of [`16-operations-and-security`](16-operations-and-security.md). The
instant-ban path in [`17-auth-follow-ups`](17-auth-follow-ups.md) is the first
concrete admin action to build.

## Administration

- [ ] Build authenticated, role-authorized admin actions for kick, ban, mute,
  teleport, content/event controls, and read-only inspection. Audit every action
  with actor, target, reason, before/after, and result.
- [ ] Never use hand-edited production data as routine administration.

## Required tests

- [ ] Admin actions require the correct role, validate the target, and append
  a complete audit record in the same transaction as the change.
- [ ] Unauthorized or forged admin intents are rejected and reported.

[Back to overview](README.md)
