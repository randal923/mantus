# Gap 9: Four storybook tests fail on a clean tree

**Severity:** medium (the storybook lane cannot gate changes while red)
**Verified:** 2026-08-05 — reproduced on an unmodified checkout (all four fail
identically with the working tree stashed), so these are not regressions from
current work.

## Failing stories

| Story | Failure |
|---|---|
| `ProficiencyModal.stories.tsx` › Locked Levels | cannot find text "Unlocks at 100,000 XP" |
| `WikiCharacter.stories.tsx` › Combat | `onRequestCyclopedia` spy called once, expected never |
| `SpellListModal.stories.tsx` › Knight | cannot find text "Wound Cleansing" |
| `ActionBar.stories.tsx` › Empty | `onConfigure` spy never called, expected `[0, "spell"]` |

A fifth (`GameHud` › Chat Hotkey Stays Enabled With Hud Panels) is
timing-flaky rather than hard-red — see gap-7.

## Impact

`yarn test` (root) does not run the storybook project, so these reds are
invisible in the normal loop and will silently absorb real regressions in
those components. Either the stories drifted from the components (copy
changes, interaction changes) or the components regressed without any gate
noticing — each needs a look to decide which side is wrong.

## Recommended fix

Fix or update the four stories, then add the storybook project to a CI lane
(it runs in ~75 s headless) so it stays green.
