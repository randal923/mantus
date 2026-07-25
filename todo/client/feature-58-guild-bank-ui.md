# Feature 58 (client) — guild bank deposit/withdraw controls

Part of the [client backlog](README.md). Server side shipped:
[done.md record](../done.md).

## Why
The `guild-deposit` / `guild-withdraw` intents (`protocol/src/guild.ts`) and
the balance/points/level projection all ship, and withdrawal authorization is
enforced server-side (leader-only until the rank permission model lands). The
guild modal has no controls for any of it — a guild cannot use its bank.

## Remaining work
- A Bank section in `GuildModal`: current balance, guild points/level, and
  deposit/withdraw amount inputs.
- Deposits: any member; withdrawals: show the control but let the server
  refuse — render the refusal reason plainly rather than hiding the button,
  so the leader-only rule (and later the rank rule) stays server-owned.
- Clamp amounts client-side to the schema bounds before sending (the server
  still enforces; the clamp only avoids guaranteed-refused sends).
- Locale keys: `guild.bank.*` including the refusal reasons, both files.

## Implementation
- New `client/components/guild/GuildBankSection.tsx`, registered inside
  `GuildModal.tsx` next to `GuildRosterSection`.
- Handle the balance projection branch wherever guild state lands
  (`handleCommunityMessage.ts`) and store it with the existing guild state.
- Amounts are integer gold; reuse the bank panel's amount-input conventions
  from `client/components/bank/`.

## Tests
- Storybook: member view (deposit only succeeds), leader view, refusal state.
- Unit test for the amount clamp helper.

## Dependencies
None; protocol and server ship. Per-rank withdrawal permission is server work
and stays with [Feature 58](../todo-9.md).
