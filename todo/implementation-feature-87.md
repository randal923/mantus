# Feature 87 — Client polish (lighting, sound, input, HUD, modals, settings)

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
A large slice of remaining parity is client presentation and input. The rule throughout: polish is display-only — any gameplay-affecting control sends a bounded intent, and settings that look persistent must actually persist.

## Remaining work
- Lighting/day-night cycle, item/creature light sources, floor darkness, visibility-safe effects.
- Sound/music with bounded asset loading and accessible volume/mute controls.
- Hotkeys, action bars, targeting controls, mouse/touch input, context menus, drag feedback, keyboard accessibility. The current settings key mapping and bottom spell bar are visual previews only — persist validated bindings, and send bounded cast intents only after the execution path exists.
- Battle list filters, party frames, status icons, combat log, loot channel, quest tracker, notification UX.
- Generic bounded modal windows + typed answers for Canary modal-driven interactions — no open-ended server UI evaluator.
- Settings persistence/localization/accessibility/responsive layout — `GameMenuModal.tsx` currently keeps language/volume/hotkey changes only while the modal is open.

## Implementation
- All client-side in `client/`: lighting in `client/lib/render/WorldRenderer.ts`; settings persisted via the bounded `accounts.ui_settings` schema or localStorage as appropriate.
- Hotkey/action-bar persistence reuses the `023_character_action_bar.sql`/`029_character_potion_action_bar.sql` patterns.
- Gameplay-affecting controls (cast, target, loot) send intents — visible cooldowns/counters remain decoration per the charter; the server's version is the real one.
- Modal answers are typed and validated against a bounded schema, never evaluated as server-driven UI code.

## Tests
- Persisted bindings survive relogin; settings changes stick after closing the modal.
- No polish path introduces a client-enforced-only limit.

## Dependencies
- Spell-cast intent path (shipped) and ui_settings (shipped).
