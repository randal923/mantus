# Feature 65 — Friend-system completion

Part of [Todo 15 — Parties, guilds, PVP, houses, and social services](todo-15.md).

## Why
The shipped friend system is a one-way private VIP list. Canary-style social features need reciprocal relationships, grouping, and the privacy switches other features (party finder) rely on.

## Remaining work
- Reciprocal friend requests/acceptance (currently one-way VIP only).
- VIP groups.
- Typing state indicator.
- Leader/member finder visibility rules (consumed by the party finder).
- Exiva restrictions — blocked: no exiva spell exists yet.
- Ignore lists — client-side in pinned Tibia; decide client-side vs. server support.

## Implementation
- Extend the `020_social.sql` schema with a friend-request/edge table and a VIP-group table (new migration).
- Request/accept/decline intents in `protocol/src/vip.ts` (bounded schemas + rate limits first), logic in `server/src/social/VipService.ts` + `PgVipStore.ts`, reusing the reverse watcher index for presence.
- Typing state as an ephemeral, rate-limited chat event — no persistence, shared only with the conversation partner.
- Finder visibility settings stored per character and consumed by Feature 56 at query execution time.
- Exiva restrictions wait on the spell (todo-8 catalog).
- Ignore lists: default to client-side per pinned Tibia unless server-side filtering proves necessary; record the decision.

## Tests
- Request forging rejected (cannot accept a request that was never sent; server-derived ids only).
- Presence not leaked to non-friends/non-watchers.
- Group counts and list sizes bounded (20 free / 100 premium limits still enforced).

## Dependencies
- Feature 56 (party finder consumes visibility rules).
- Chat system (shipped); exiva blocked on the spell catalog (todo-8).
