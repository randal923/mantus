# Feature 69 — completed

UI-settings polish, from
[implementation-feature-69.md](../implementation-feature-69.md).

Cross-links: [todo-16.md](../todo-16.md).

---

## 2026-07-25 — Reset control, live-session sync, panel schema

**Problem.** No "reset layout" control, the `ui-settings-updated` ack was
ignored client-side (so two live sessions on one account diverged until
relogin), and only the minimap panel had a stored layout.

**What changed.** Settings are account-wide, so `UiSettingsHandler` now acks
**every live session of the account**, updating each one's cached account and
pushing the new settings; the client applies that ack, so a second client
converges without relogging. The reset control drops every stored panel layout
while keeping the non-layout preferences, and persists immediately rather than
through the debounce. `uiSettingsSchema` gained a shared bounded
`panelLayoutSchema` with `chat`, `battleList`, and `spellBar` entries.

**Files touched.**
`protocol/src/uiSettings.ts`, `server/src/UiSettingsHandler.ts`,
`client/components/settings/GameMenuModal.tsx`,
`client/components/game-window/{GameSettingsOverlay.tsx,messages/handleCharacterSessionMessage.ts}`,
`client/locales/{en,pt-BR}.json`.

**How it was verified.** `UiSettingsHandler.test.ts` — a second live session on
the same account receives the ack and has its cached account updated, without
relogging.

**Residual risk.** The three new panel layout keys are stored and validated but
not yet consumed: the chat, battle-list, and spell-bar components are still
fixed-position. Making them draggable is client work that reuses the minimap
panel's existing drag/resize helpers.
