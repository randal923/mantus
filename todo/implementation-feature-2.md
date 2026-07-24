# Feature 2 — Character rename/delete flows with authorization tests

Part of [Todo 2 — Characters](todo-2.md).

## Why
Rename/delete are the only unchecked character-system items and are conditional — they are deferred product operations. When built, cross-account authorization tests must land with them so a user can never rename or delete another account's character.

## Remaining work
- When rename/delete flows are added, prove a user cannot rename or delete another account's character.
- Currently no rename/delete protocol messages exist in `protocol/src/character.ts` and no rename handler exists in `server/src/`; a `tools/deleteCharacter.mjs` dev script exists but is not a player flow.

## Implementation
When the product decision lands:
- Define zod messages in `protocol/src/character.ts` with max byte size and rate expectations before implementing handlers (charter: new packets get schema + size + rate first).
- Handle in `server/src/character/CharacterService.ts`, deriving the account from the authenticated session — never from the message body.
- Re-check ownership at execution time inside the tick, not at enqueue.
- Perform the rename/delete in a single DB transaction; rename must preserve globally unique normalized names.

## Tests
- Integration tests alongside `server/src/character/PgCharacterStore.integration.test.ts`:
  - Cross-account rename rejected.
  - Cross-account delete rejected.
  - Two racing renames to the same normalized name leave uniqueness intact (exactly one winner).

## Dependencies
- Product decision to ship rename/delete flows.
