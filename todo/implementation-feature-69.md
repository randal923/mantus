# Feature 69 — UI-settings polish

Shipped 2026-07-25 — see
[completed/implementation-feature-69-completed.md](completed/implementation-feature-69-completed.md)
for what landed and how it was verified. Only the items below remain.

Client-side work is tracked separately in [client/feature-69-movable-panels.md](client/feature-69-movable-panels.md).

## Remaining work

- Make the chat, battle-list, and spell-bar panels movable. Their layouts are
  stored and validated in `uiSettingsSchema` already; the components are still
  fixed-position and can reuse the minimap panel's drag/resize helpers.

## Dependencies

- None (ui_settings infrastructure shipped).
