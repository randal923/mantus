# Feature 57 — completed sub-work

Party polish, from
[implementation-feature-57.md](../implementation-feature-57.md). The feature
stays **open**: party-aware spells are still blocked on the spell catalog.

Cross-links: [implementation-feature-57.md](../implementation-feature-57.md) ·
[todo-15.md](../todo-15.md).

---

## 2026-07-25 — Invite-pending shield variants

**Problem.** Pending invitations had no nameplate marker, so neither side of an
invitation could see it in the world.

**What changed.** `PartyShieldKind` gains `invitee` (whitish-blue) and `inviter`
(whitish-yellow). `derivePartyView` builds the renderer's view from the two
projections the server already scopes to this player — their own `party-state`
(whose `invited` list yields the invitee ids) and the `party-invitation`
addressed to them (whose `leaderId` yields the inviter) — so the whitish shields
appear for exactly the two sides of an invitation and for nobody else, matching
Canary's visibility rule without broadcasting anything new. Pending shields
outrank the public gray marker; joining a party or a revoked invitation clears
them.

**Files touched.** `client/lib/render/{CreatureView,WorldRenderer,derivePartyView}.ts`,
`client/components/game-window/messages/handleCommunityMessage.ts`.

**How it was verified.** `derivePartyView.test.ts` (3 cases: own party with
invitees, an inviting leader with no party of one's own, and neither).
