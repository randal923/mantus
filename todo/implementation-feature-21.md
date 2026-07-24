# Feature 21 — Potion sound and target monster-say

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

## Why

Canary plays a potion-use sound and makes the target say `Aaaah...`; we do neither. Blocked on a shared protocol surface for item sounds and server-authored creature speech that does not exist yet.

## Remaining work

- Build the shared item-sound + creature-speech server message surface.
- Emit both from the potion-use path; render sound and speech bubble client-side.

## Implementation

- Add a sound/creature-speech server message in `/home/randal/code/tibia/protocol/src/serverMessages.ts` (zod schema first, per charter).
- Emit from the potion path around `/home/randal/code/tibia/server/src/combat/CombatIntentHandler.ts`.
- Render client-side (sound playback + creature say text).
- Visibility-scoped only: the message goes exclusively to observers who can see the drinking creature (charter rule 6).
- Canary reference: potion action script (sound effect + `Aaaah...` monster-say).

## Tests

- Speech/sound message is never sent to sessions that cannot see the target.

## Dependencies

- Shared item-sound + creature-speech protocol surface (not built); the creature-speech mode part is shared with Feature 28 (spell speech mode).
