# Feature 21 — Potion sound and target monster-say

Part of [Todo 8 — Combat, spells, and conditions](todo-8.md).

**Completed 2026-07-25 (speech half; sound dropped by decision).**
`creature-spoke` gained the `monster-say` mode — players cannot forge it, the
`speak` intent still takes only say/whisper/yell — and `PotionService` makes
the target say `Aaaah...`, scoped via `Visibility` to observers who can see the
drinker. The client floats it in orange and logs it in the local channel.

The potion sound was built and then removed at the product owner's request; no
audio surface exists in the codebase. Any future sound work (assets, playback,
volume/mute controls) starts fresh under
[Feature 87 — Client polish](implementation-feature-87.md).

Full record, files touched, and verification in
[completed/implementation-feature-21-completed.md](completed/implementation-feature-21-completed.md).
