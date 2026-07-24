# Todo 2 — Characters

The character system is essentially complete: schema, name validation, server-chosen starter options, atomic one-live-session claim, versioned save snapshots, the full character-select client, and the pg-backed authorization/race test suite all shipped — see [done.md](done.md). The only open item is conditional: rename/delete flows are deferred product operations, and when they ship they must land with cross-account authorization tests.

## Remaining features

- [ ] **Feature 2 — Character rename/delete flows with authorization tests** — When rename/delete are built, prove a user cannot rename or delete another account's character. See [implementation](implementation-feature-2.md).

[Back to overview](README.md)
