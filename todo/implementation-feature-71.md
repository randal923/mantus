# Feature 71 — Mounts

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Mounts are entitlements with a gameplay effect: a server-side speed bonus and distinct rendering. The speed bonus especially must be server-authoritative.

## Remaining work
- Mount ownership (entitlement storage).
- Selection validation.
- Speed bonus applied server-side.
- Client rendering of mounted outfits.

## Implementation
- Same entitlement pattern as Feature 70 (table + server-side grants + execution-time selection validation).
- Speed bonus in the server movement speed calculation (`server/src/world/MovementRules.ts` area) — the client's displayed speed is decoration (charter rule 8).
- Mount sprite layering in the client renderer — beware the pattern/layer gotchas documented in the asset-format memory (`client/ASSETS.md`).

## Tests
- Forged mount ids rejected.
- Walk-step validation uses the server-computed mounted speed; a client claiming mounted speed while unmounted is snapped back.

## Dependencies
- Feature 70 (outfit/entitlement infrastructure).
