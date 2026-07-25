# Feature 21 — completed

Cross-links: [implementation-feature-21.md](../implementation-feature-21.md) ·
[todo-8.md](../todo-8.md).

---

## 2026-07-25 — Target monster-say on potion use (sound dropped by decision)

**Problem.** Canary's potion action script makes the target say `Aaaah...`
(`TALKTYPE_MONSTER_SAY`) and plays a use sound; we emitted only the magic
effect. The speech half was blocked on the protocol: `creature-spoke` could
carry only the three player speech modes, so a server-authored effect line had
no mode to travel in.

**Scope decision (2026-07-25).** The potion *sound* was built and then removed
at the product owner's request: the placeholder audio was not wanted, so the
`sound-effect` message, the client sound player, the generated asset, and the
volume/mute settings were all deleted rather than shipped. **No audio surface
exists in the codebase.** If sound is revisited it starts from scratch under
Feature 87 (client polish: lighting, sound, input, HUD), which owns the audio
pack and its accessible volume/mute controls; this feature is closed on the
speech half only.

**What changed.**

- `protocol/src/chat.ts` — added `CREATURE_SPEECH_MODES` /
  `creatureSpeechModeSchema` (`say | whisper | yell | monster-say`) and pointed
  `creatureSpokeMessageSchema.mode` at it. The inbound `speak` intent still
  uses `chatSpeechModeSchema`, so a client cannot forge `monster-say`.
- `server/src/Visibility.ts` — `broadcastCreatureSpeech` now takes a
  `CreatureSpeechMode` instead of a `yell` boolean.
- `server/src/potion/PotionService.ts` — after the potion commits, broadcasts
  the target's `Aaaah...` as `monster-say`, alongside the existing magic
  effect. It reaches only sessions that can see the drinker and already know
  him (`knowingViewerSessions`, charter rule 6).
- `server/src/creature/MonsterEventService.ts`, `server/src/spawn/SpawnManager.ts`
  — call sites updated to the new speech-mode parameter (monster speech keeps
  `say`/`yell`; only the potion line uses `monster-say`).
- `client/lib/render/SpeechTextRenderer.ts` — floats `monster-say` in orange
  (`0xfe6500`) instead of the yellow player-speech color; `WorldRenderer`
  forwards the mode.
- `client/lib/chat/chatReducer.ts`, `speechTone.ts` (new), `toChatMessage.ts`,
  `components/chat/chatTypes.ts`, `chatStyles.ts` — speech entries keep their
  mode, and `monster-say` renders in the new `monster` tone (orange) in the
  local channel, matching Tibia's default-channel behavior.

**Files touched.** `protocol/src/chat.ts`, `server/src/Visibility.ts`,
`server/src/Visibility.test.ts`, `server/src/potion/PotionService.ts`,
`server/src/creature/MonsterEventService.ts`, `server/src/spawn/SpawnManager.ts`,
`server/src/combat/Combat.test.ts`, `client/lib/render/WorldRenderer.ts`,
`client/lib/render/SpeechTextRenderer.ts`,
`client/lib/render/SpeechTextRenderer.test.ts`, `client/lib/chat/chatReducer.ts`,
`client/lib/chat/chatReducer.test.ts`, `client/lib/chat/speechTone.ts` (new),
`client/lib/chat/toChatMessage.ts`, `client/components/chat/chatTypes.ts`,
`client/components/chat/chatStyles.ts`.

**Verification.**

- `server/src/combat/Combat.test.ts` — new test drinks a potion with two other
  connected sessions: an adjacent observer (who knows the drinker) receives the
  `monster-say`; a far observer that *claims* to know the drinker (id planted
  in `knownCreatureIds`) receives nothing. The harness gained an optional
  `bystanderPositions` option for this.
- `client/lib/chat/chatReducer.test.ts` — a `monster-say` line keeps its mode
  and maps to the `monster` tone.
- `client/lib/render/SpeechTextRenderer.test.ts` — `monster-say` floats in a
  different color than `say`.
- Full runs: `yarn workspace server test` → 787 passed / 182 skipped;
  `yarn workspace client test` → 220 passed; typecheck clean in protocol,
  server, and client. Storybook project: the 4 failures in
  `ActionBar`/`GameHud`/`SpellListModal` are pre-existing at HEAD (verified by
  stashing this work) and untouched by it.

**Residual risk / deferred.**

- No potion sound and no audio surface at all — dropped above; Feature 87 owns
  any future sound work including volume/mute controls.
- `monster-say` currently rides only on the potion line. Monster speech still
  uses `say`/`yell`, and Feature 28 (spell speech mode) will decide which spell
  lines adopt the new mode.
