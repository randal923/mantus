# Feature 23 (client) — combat analyzer panel and aim-at-target toggle

Part of the [client backlog](README.md). Server side shipped:
[done.md record](../done.md).

## Why
Feature 23's server half ships two surfaces the client stores but never
renders: the combat analyzer (damage/healing dealt and taken, per-session,
reset on request) and the per-character aim-at-target spell set. The store
already tracks `combatAnalyzer` state (`GameWindowState.combatAnalyzer`,
filled by `handlePlayerStateMessage.ts`) and `GameClient.resetCombatAnalyzer()`
exists — there is simply no panel, and nothing sends
`set-aim-at-target-spells`.

## Remaining work

### Combat analyzer panel
- A panel rendering `combatAnalyzer` (damage dealt/taken, healing, per-source
  breakdown as carried by the projection) with a Reset button wired to
  `GameClient.resetCombatAnalyzer()`.
- Handle the `aim-at-target-update-failed` / `-pending` error codes with real
  wording (locale keys under a new `combat.analyzer.*` / `combat.aim.*`
  section, both locale files).
- Follow `PartyAnalyzerSection.tsx` for shape and wording — the two analyzers
  should read as siblings.

### Aim-at-target toggle
- A per-spell toggle in the spell list; collect the enabled spell ids and send
  `set-aim-at-target-spells` (bounded set — clamp client-side to the schema
  max before sending).
- Apply the server echo `aim-at-target-spells` as the source of truth; the
  toggle is decoration until the echo lands (charter rule 8).

## Implementation
- New `client/components/combat/CombatAnalyzerPanel.tsx` (one exported
  component); entry point next to the existing combat HUD controls.
- `GameClient` needs `setAimAtTargetSpells(spellIds)`; the reset method
  already exists.
- Aim toggle lives in the existing spell-list component under
  `client/components/spells/`; render the current set from the server echo,
  never from local optimistic state.

## Tests
- Storybook: analyzer with data and empty state; spell list with a mixed
  aim-at-target set.
- Store unit test: `aim-at-target-spells` echo replaces (not merges) the set.

## Dependencies
None; protocol and server ship. The boss-difficulty/hazard panels are **not**
this file — those systems are unbuilt server-side (Feature 86).
