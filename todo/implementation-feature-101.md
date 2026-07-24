# Feature 101 — Auth follow-ups closure

Part of [Todo 19 — Auth follow-ups](todo-19.md).

## Why
The auth area is nearly done but the todo file misstates reality (stale checkboxes) and three closure items remain: production role-gating for the already-built instant-ban path, a legitimate way to grant Mantus Coins, and the pre-public residual-risk checklist.

## Remaining work

### Instant ban — verify and update stale checkboxes
- SUBSTANTIALLY IMPLEMENTED but the boxes are stale-unchecked: `ModerationService.gmBan` writes `banned_until` via `PgModerationStore.banAccount` (state change + audit row in the same transaction), immediately disconnects every live session (`sendError("account-banned")`), and login re-checks `banned_until`; wired to `/ban`; tests exist (`ModerationEnforcement.test.ts`, `PgModerationStore.integration.test.ts`).
- Residual: the path is DEV_COMMANDS-gated, not role-gated — Feature 96 is the fix.
- Verify banned-account-cannot-reconnect coverage exists; update the todo checkboxes to match reality.

### Mantus Coin funding path
- The store can spend coins but nothing production-grade can grant them. Extend `server/src/store/PgMantusStore.ts` with an authorized grant operation writing the coin ledger plus audit row in one transaction; admin trigger via Feature 96; a payment provider is a separate deployment decision.

### Residual risk closure (pre-public checklist)
- Bearer-token replay window: mitigate with WSS/TLS, short-lived tokens, the one-session rule; never log tokens.
- XSS token theft: React escaping, no user strings in `dangerouslySetInnerHTML`, strict CSP, small dependency surface.
- Free-form join-name impersonation: removed via the account-owned unique character flow (done) — verify the free-form path is actually removed.
- Supabase captcha plus production auth rate limits before going public.
- Confirm identity always derives from the verified token (audit task across the session stack).
- Connect the preview change-email/change-password forms to supported Supabase reauth/confirmation flows; surface failures; never log plaintext credentials.

## Implementation
- Role gate via Feature 96's account role column and session gate.
- Token-derivation audit across `server/src/AuthHandler.ts`, `CharacterHandler.ts`, `SessionRegistry.ts` (charter rule 9: never accept an account/character id from the message body).
- CSP in the Next config; change-email/password forms call the Supabase reauth APIs.
- Captcha and production rate limits are recorded as Feature 100 checklist items.

## Tests
- Old and refreshed sessions cannot both control a character.
- Auth failures and logs contain no bearer token or password.
- Origin, connection, token-expiry, and account rate limits behave per production policy.
- Banned account cannot reconnect (verify existing coverage or add it).
- Coin grant writes ledger + audit atomically; unauthorized grant rejected.

## Dependencies
- Feature 96 (role authorization for ban and coin grants).
- Feature 93 (WSS/TLS, origin policy, connection limits).
- Feature 100 (captcha/rate-limit checklist items land in the launch gate).
