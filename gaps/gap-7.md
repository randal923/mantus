# Gap 7: Flaky storybook test — GameHud "Chat Hotkey Stays Enabled With Hud Panels"

**Severity:** low (CI reliability)
**Observed:** 2026-08-05 — failed under machine load, passed unchanged on
re-run.

## Evidence

`stories/GameHud.stories.tsx` › "Chat Hotkey Stays Enabled With Hud Panels"
asserts the chat input has focus after pressing Enter. `ChatPanel` focuses the
input inside `window.requestAnimationFrame(() => inputRef.current?.focus())`
(`components/chat/ChatPanel.tsx`), so under CPU contention the assertion can
run before the rAF callback:

```
expect(element).toHaveFocus()
Received element with focus: <body>
```

## Recommended fix

In the play function, wait for focus with an expect-poll (`await
waitFor(() => expect(input).toHaveFocus())`) instead of asserting immediately
after the keypress, or flush a rAF before asserting.
