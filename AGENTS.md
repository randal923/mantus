# Security charter for building this game

This repo is an online game (Tibia-clone): PixiJS client in `client/`, a
server-authoritative Node.js game server in `server/`, shared zod message
schemas in `protocol/`, Postgres persistence. Online games are adversarial software — assume every player runs
a modified client. These rules are mandatory for ALL gameplay code you write
or review. Rationale and the full roadmap live in `plan.md`; asset-format
rules live in `client/AGENTS.md` and `client/ASSETS.md`.

## The golden rule

The client sends **intents** ("walk north", "cast spell 2", "move item A to
slot B"). The server computes **all outcomes**. If you find yourself writing
gameplay state, damage math, RNG, cooldown checks, loot rolls, or economy
logic that runs in `client/`, stop — it belongs on the server. Client-side
copies of these exist only for prediction/display and are never trusted.

## Never do these

1. **Never trust a value from the network.** No client-supplied damage,
   position, speed, price, item count, or random number is ever used
   directly. Validate every inbound message against its zod schema first;
   drop anything malformed. Bounds-check every id, index, and slot number
   before use — never index arrays/containers with raw client input.
2. **Never create, copy, or destroy an item in more than one step.** An item
   has exactly one owner (one row in `items`). "Move" is a single atomic
   operation; copy-then-delete or delete-then-insert across steps is how
   dupes are born. Ownership transfers (trade, market, shop) are one ACID
   transaction, committed before the players are told it succeeded.
3. **Never `await` in the middle of mutating shared game state.** Finish the
   in-memory mutation synchronously inside the tick, then persist. Any yield
   point between "checked" and "changed" is a race window (double-spend,
   double-move, dupe).
4. **Never act on stale validation.** Re-check ownership, distance, mana,
   cooldown, capacity at _execution_ time inside the tick loop, not when the
   intent was enqueued.
5. **Never mutate game state from a socket/timer callback.** All intents go
   through the per-tick queue so operations on the same entity serialize.
6. **Never send the client what its player cannot see.** No out-of-view
   creatures, other players' inventories, hidden HP, or server internals in
   any message or error. Wallhacks/ESP are built from over-sharing servers.
7. **Never build SQL by string concatenation.** Parameterized queries only.
8. **Never enforce a limit only in the UI.** Every cooldown, exhaust, walk
   speed, weight/capacity limit, and rate limit the client displays must
   also be enforced server-side; the server's version is the real one.
9. **Never store or log secrets/credentials in plaintext.** Passwords are
   argon2id-hashed; session tokens are short-lived, bound to one connection,
   and never logged. Authorize every action against the session's own
   character — never accept an account/character id from the message body.
10. **Never let one connection consume unbounded resources.** Cap message
    size, message rate, and connections per IP; disconnect on breach.
11. **Never skip the audit log for economy events.** Trades, market
    transactions, gold/rare creation and destruction are appended to
    `audit_log` in the same transaction that performs them.
12. **Never restore or hand-edit production data without reconciling the
    audit log** — rollbacks are a dupe vector players actively exploit.

## When writing specific systems

- **Movement:** server re-validates each step (adjacent, walkable, speed vs
  ground). Reject teleports/large deltas; snap the client back on mismatch.
- **Combat/spells:** server rolls all RNG, applies all formulas, enforces
  exhaust. The client's spell bar cooldown is decoration.
- **Containers/trade/market:** treat as concurrent-by-default. Write the
  exploit test first: two intents racing for the same item must leave exactly
  one item. Money and item legs of a sale live in one transaction.
- **Login/sessions:** one session per character; kick the old one. Items load
  once at login and lock while online; offline characters are touched only
  via DB transactions.
- **New packets:** define the zod schema + max size + rate expectation in
  `protocol/` before implementing the handler.

## Definition of done for gameplay PRs

A feature touching items, gold, stats, or player state is not done until:

- [ ] all validation happens server-side at execution time,
- [ ] state changes are atomic (single tick mutation + single DB transaction),
- [ ] a regression test exists for the obvious exploit (race, replay,
      out-of-range input, insufficient funds going negative),
- [ ] economy-relevant changes write to the audit log,
- [ ] nothing new is sent to clients beyond what their player can see.

If a requested change conflicts with these rules, say so and propose the safe
variant instead of implementing the unsafe one.

## Code Principles

## Package Manager

Use Yarn, not npm.

## Core Principles

Keep changes simple, direct, and TypeScript-first.

Do not add abstractions, helper layers, validators, factories, adapters, or new dependencies unless the current code path clearly needs them. When unsure, ask first.

Prefer small, cohesive files with one clear responsibility.

## File Structure

- One exported top-level function, component, hook, or class per file.
- Name files after the main export.
- Prefer named exports unless the framework requires default exports.
- Do not place helper functions, subcomponents, or custom hooks below a component. Extract them into their own files.
- Keep business rules in pure feature-local `utils/` or `lib/` files.
- Keep React components focused on rendering and orchestration.

## Code Standards

- Avoid `any`, loose objects, and stringly typed state.
- Return early to reduce nesting.
- Avoid mutation of props, state, shared module state, or values passed to JSX.
- Handle async failures deliberately.
- Keep comments rare and useful.
- Do not expose secrets to browser or renderer code.
- Treat user input, environment variables, request data, filesystem paths, and IPC payloads as untrusted.

## React Standards

- Follow the official React rules of hooks.
- Components and hooks must be pure and idempotent.
- Use effects only for syncing with external systems.
- Prefer derived render values over effect-driven state.
- Use reducers for complex state transitions.
- Keep props explicit and minimal.
- Use stable domain IDs for keys.
- Build accessibility in by default.

## Next.js Standards

- Prefer Server Components by default.
- Add `"use client"` only at the smallest interactive boundary.
- Keep Client Component props serializable.
- Keep secrets, server-only work, and environment parsing out of Client Components.
- Use Route Handlers for server endpoints.
- Use Next metadata conventions for SEO.

## Tailwind Standards

- Prefer standard Tailwind utility classes and design-system tokens over arbitrary values.
- Use classes like `text-sm`, `text-base`, `text-xl`, `font-medium`, `gap-4`, and `p-6` instead of arbitrary values like `text-[25px]`, `font-[25px]`, `gap-[13px]`, or `p-[18px]`.
- Use arbitrary values only when required to match a specific design spec and no existing Tailwind token fits.
- Avoid inline styles when the same result can be expressed with Tailwind classes.

## Node, Electron, and Server Code

- Prefer modern ECMAScript modules where supported.
- Use explicit Node built-in imports such as `node:fs/promises`.
- Prefer async, non-blocking APIs.
- Keep Electron main, preload, and renderer responsibilities separate.
- Expose the smallest safe IPC surface.
- Avoid Node-only APIs in browser-rendered code.

## Agent Workflow

- Do not run `yarn dev`, development servers, preview servers, or long-running watch commands in the agent session.
- Do not start local servers unless explicitly asked.
- Prefer static checks, tests, builds, type checks, and lint commands that exit on completion.
