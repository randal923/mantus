# Feature 102 — Dev tooling gaps

Part of [Todo 20 — Dev tooling](todo-20.md).

## Why
The dev tooling suite (DEV_AUTH, GM commands, playtest harness) shipped and is in daily use, but five gaps remain — one of which (slotless-creature AI detach) affects production because regular summons share the code path, and one of which (character deletion) violates charter rule 11 in a dev tool.

## Remaining work
- **Render `gm-response` in the game client.** The protocol schema `protocol/src/gm.ts` exists and the headless client reads it, but the PixiJS client has no handler (verified: no handler under `client/`). Add dispatch in `client/lib/net/GameClient.ts` plus chat/console UI in `client/components/game-window/`.
- **Per-account GM gating.** GM commands are server-wide under `DEV_COMMANDS=1` — any connected player can use them. Fix = role column + session gate; converges with Feature 96 (do not implement separately here).
- **Slotless-creature AI detach.** GM-spawned monsters (and regular summons, same path) have no spawn slot, so AI detach skips them; brains stay registered until death. Fix in the `server/src/ai/` detach logic. Matters for production, not just dev.
- **Dev de-level support for `/level`.** Progression only supports awarding experience; add a dev-gated negative-exp path. Low priority.
- **`character-deleted` audit event.** `yarn character:delete` (`tools/deleteCharacter.mjs`) writes `item-destroyed` per item, but the destroyed bank balance is only printed to console — there is no fitting event type in `audit_log_event_type_check` (charter rule 11 violation in a dev tool). New migration following the drop-and-recreate constraint pattern (012/013/018/030); update the tool to append the event inside the deletion transaction.

## Implementation
- Client gm-response: `client/lib/net/GameClient.ts` message dispatch + a chat/console surface in `client/components/game-window/`.
- AI detach: `server/src/ai/` — make detach cover slotless creatures.
- De-level: dev-gated negative experience in the progression path, reachable from `GmCommandHandler.ts`.
- Audit event: migration + `tools/deleteCharacter.mjs` change, event appended in the same transaction as the deletion.

## Tests
- A slotless summon's brain detaches when no player is near.
- Character deletion writes the `character-deleted` audit event (including the destroyed bank balance) in the deletion transaction.
- gm-response renders in the client chat/console.

## Dependencies
- Feature 96 (per-account GM gating — the role migration and session gate land there).
