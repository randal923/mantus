# Known authentication follow-ups

These gaps predate the feature split and remain deliberately deferred. Resolve
them before public deployment, alongside
[`17-operations-and-security.md`](17-operations-and-security.md).

## Instant ban enforcement

`banned_until` is currently read once when the token is verified, so banning an
online player does nothing until they reconnect.

- [ ] Recommended: add an authorized game-server admin action (`/ban` command
  or admin endpoint) that writes `banned_until`, kicks the live session, and
  appends the audit record in one place. The audited path is also the instant
  path; production data should not be hand-edited.
- [ ] If a temporary stopgap is needed sooner, periodically re-check
  `banned_until` for online accounts in the tick loop and accept/document the
  polling delay and recurring database reads.
- [ ] Do not build LISTEN/NOTIFY plumbing solely to support hand-edited account
  rows unless another durable event use case justifies it.

## Premium entitlement operations

`accounts.premium_until` is authoritative and defaults to free. Login captures
the timestamp, while runtime checks use the server clock so an online premium
account loses regeneration and gated actions immediately at expiry.

- [ ] Add an authorized, audited purchase/grant/renewal path that updates
  `premium_until`; do not make hand-edited production rows the normal account
  workflow.
- [ ] Propagate renewals to an online session. Expiry is live today, but added
  time is not observed until the account reconnects because the session holds
  the timestamp loaded at authentication.

## Accepted residual auth risks

- [ ] Bearer-token replay window: a stolen access token works until expiry. Use
  WSS/TLS in production, short-lived tokens, and the one-session rule; never log
  tokens.
- [ ] XSS can steal a token kept in browser storage. Keep React escaping, never
  put user strings into `dangerouslySetInnerHTML`, use a strict CSP where
  practical, and keep dependencies small/current.
- [ ] Free-form join names permit impersonation. Remove that path through the
  account-owned unique character flow in [`01-characters.md`](01-characters.md).
- [ ] Signup abuse and credential stuffing rely partly on Supabase controls.
  Enable captcha and production auth rate-limit/settings before public access.
- [ ] Confirm account/session authorization always derives identity from the
  verified token and never a body-supplied account or character id.
- [ ] Connect the preview change-email and change-password forms to the
  supported Supabase reauthentication/confirmation flows, surface failures,
  and never log or persist plaintext credential input in client state.

## Required tests

- [ ] Banning an online player through the supported admin path commits the ban,
  audit entry, and disconnect behavior coherently.
- [ ] A banned account cannot reconnect/select a character until allowed.
- [ ] Old and refreshed/replaced sessions cannot both control a character.
- [ ] Auth failures and logs contain no bearer token, password, or credential.
- [ ] Origin, connection, token-expiry, and account rate limits behave as the
  production policy specifies.

[Back to overview](README.md)
