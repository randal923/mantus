# Feature 69 — UI-settings polish

Part of [Todo 16 — Remaining Canary systems and client polish](todo-16.md).

## Why
Account-wide UI settings shipped with a strict bounded schema; three client-side gaps remain.

## Remaining work
- No "reset layout to default" control.
- `ui-settings-updated` ack is ignored client-side, so two live sessions on one account don't sync layouts until relogin.
- Other panels (chat, battle list, spell bar) are still fixed; the schema is ready for them.

## Implementation
- Client-only work: settings components under `client/components/settings/` (e.g. `GameMenuModal.tsx`); extend `uiSettingsSchema` usage to more panels; apply the `ui-settings-updated` ack to live sessions.

## Tests
- Layout changes in one session appear in a second live session without relogin.

## Dependencies
- None (ui_settings infrastructure shipped).
