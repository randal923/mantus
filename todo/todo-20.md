# Todo 20 — Dev tooling

The dev-only testing infrastructure shipped 2026-07-18 (see [done](done.md)): `DEV_AUTH=1` swaps in `DevTokenVerifier`, `DEV_COMMANDS=1` enables the GM chat commands (`/i`, `/spawn`, `/goto`, `/level`, `/heal`, `/where`, and now `/kick`, `/ban`, `/mute` via `server/src/gm/GmCommandHandler.ts`), and `server/src/playtest/` provides a headless protocol client plus scenario scripts against the docker `playtest` Postgres. What remains is a set of gaps: the PixiJS client cannot render `gm-response`, GM commands are server-wide rather than per-account (fix converges with Feature 96), slotless GM-spawned creatures and summons leak AI brains, `/level` cannot de-level, and `yarn character:delete` violates charter rule 11 for bank balances. The AI-detach item matters for production because regular summons share the slotless path.

## Remaining features

- [ ] **Feature 102 — Dev tooling gaps** — gm-response client rendering, per-account GM gating (pointer to Feature 96), slotless-creature AI detach, dev de-level for `/level`, and a `character-deleted` audit event. See [implementation](implementation-feature-102.md).

[Back to overview](README.md)
