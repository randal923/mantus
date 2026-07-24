# Todo 19 — Auth follow-ups

Most of this area has shipped (see [done](done.md)): audited premium purchase/renewal via the Mantus Store (wallet debit + `premium_until` renewal + ledger + audit in one transaction), live session propagation of renewals, server-clock premium-expiry checks, and a substantially implemented instant-ban path (`ModerationService.gmBan` writes `banned_until` with the audit row in the same transaction, disconnects every live session, and login re-checks the ban) whose todo checkboxes are stale-unchecked. What remains is closure work: role-gating the ban path (the DEV_COMMANDS gate is not production authorization — Feature 96 provides the fix), a production-grade Mantus Coin funding path, and the pre-public residual-risk checklist. Feature 96's role migration should land first.

## Remaining features

- [ ] **Feature 101 — Auth follow-ups closure** — Verify and update the stale instant-ban checkboxes, add an authorized Mantus Coin grant operation, and close the pre-public residual-risk checklist (token replay, XSS/CSP, captcha, rate limits, reauth flows). See [implementation](implementation-feature-101.md).

[Back to overview](README.md)
