# Plan: from demo to a real online game

## 0. Where we are

`client/` is a Next.js + PixiJS demo where **all game logic runs in the
browser** (`client/lib/game/engine.ts`): movement, combat, monster AI, spells,
HP/mana. That is fine for a demo and fatal for a real game — anything the
client computes, a cheater controls. The whole migration below is one idea
applied repeatedly: **move the truth to the server, leave only rendering and
input in the client.**

Target: `server/` — Node.js + TypeScript game server, WebSocket transport,
Postgres persistence, with gameplay features reimplemented from
[opentibiabr/canary](https://github.com/opentibiabr/canary) as the reference.

> **Licensing note:** Canary is GPL-licensed. Reading it to understand
> formulas, mechanics, and data layouts is fine; copying source into a
> closed-source server is not. Its *data* packs (monsters, spells, NPCs in
> Lua/XML) are also GPL — decide early whether this project is GPL too (then
> reuse freely) or clean-room reimplementation (then only take numbers/ideas,
> not code).

## 1. Target architecture

```
browser (PixiJS renderer + input)          ← keep client/lib/game/assets.ts
    │  wss:// JSON or binary messages
    ▼
game server (Node, single authoritative tick loop, in-memory world)
    │  async writes, transactions
    ▼
Postgres (accounts, characters, items, world state)   [+ Redis optional later]
```

- **Client sends intents** (“I press north”, “cast spell 2”, “move item X to
  slot Y”), never outcomes. It renders whatever the server broadcasts and may
  *predict* (start the walk animation immediately) but must reconcile when the
  server disagrees.
- **Server owns**: map, positions, stats, inventories, cooldowns, RNG, loot,
  damage. It runs a fixed tick (e.g. 20–50 ms) and processes queued player
  intents inside the tick — mirroring how `engine.ts` already structures
  `tick()`, which makes the port mechanical.
- **Postgres owns**: everything that must survive a restart. The in-memory
  world is a cache of it.

## 2. Phase 1 — server skeleton

1. `server/` workspace: TypeScript, `ws` (or `uWebSockets.js` for scale),
   shared `protocol/` package with message types + [zod](https://zod.dev)
   schemas used by *both* sides.
2. Fixed-tick game loop; a per-connection inbound queue drained once per tick.
   Never mutate game state directly from a socket callback — that ordering
   discipline is what later prevents most race-condition dupes.
3. Port `map.ts` + walkability, creature registry, movement, melee combat,
   monster AI, spells from `engine.ts` to the server (they are already written
   as pure-ish tick logic).
4. Broadcast layer: on each tick send each client a diff of what changed *in
   its visible area only* (Tibia uses an 18×14 viewport; send that plus one
   tile of margin).

## 3. Phase 2 — client becomes a renderer

1. Strip `engine.ts` of authority: keep sprite/animation/camera/HUD code,
   replace state mutation with “apply server event” handlers
   (creature-moved, creature-damaged, effect-played, text-floated, …).
2. Client-side prediction for your own walk steps only, with server
   reconciliation (server sends authoritative position + a step counter;
   mismatch → snap back).
3. Interpolate other creatures between server ticks so movement stays smooth.
4. Login flow → account → character select → enter world.

## 4. Phase 3 — persistence (Postgres)

Schema starting point:

- `accounts(id, email, password_hash, created_at, banned_until, …)`
- `characters(id, account_id, name UNIQUE, vocation, level, experience,
  health, mana, position, skills…)`
- `items(id BIGSERIAL, owner_type {player,tile,container,depot,market},
  owner_id, slot, item_type_id, count, attributes JSONB)` — **one row per item
  stack, one authoritative home**. An item is never in two places; moving it
  is an `UPDATE` of its owner columns, not a delete+insert.
- `market_offers`, `houses`, `guilds`, `account_bans`, `audit_log` as features
  arrive.

Rules:

- All multi-item mutations (trade, market sale, buy from NPC, move gold
  between containers) are **single ACID transactions**.
- The live server writes through to the DB either continuously (async queue)
  or on well-defined checkpoints — but *ownership changes* (trades, market)
  are transactional and synchronous: don’t ACK the trade to players until the
  DB commit succeeds.
- Use `SELECT … FOR UPDATE` / unique constraints as the last line of defense;
  the DB should *reject* a dupe even if server logic is buggy.

## 5. Phase 4 — reimplementing Canary features

Mine Canary for: damage/skill/regen **formulas**, monster stats and loot
tables, spell definitions, NPC dialog system, the OTBM map format, and
`items.otb`/`items.xml` (item attributes keyed by ids that match this asset
pack’s clientIds era). Priority order that keeps the game playable at every
step:

1. Items & containers (pick up, drop, move, stack, equip) — this is also where
   dupe-safety is designed, see §6.2.
2. Vocations, skills, experience/level, death penalties.
3. Loot + corpses, NPC shops (buy/sell), depot.
4. More spells, runes, conditions (poison, haste, protection…).
5. Player trade window; later: market.
6. Map: import a real OTBM map or grow the hand-authored city; multi-floor.
7. Houses, guilds, quests, raids — long tail, in whatever order is fun.

## 6. Security — preventing dupes and other exploits

### 6.1 The golden rule

Every number the client sends is an *attack surface*, every number the client
computes is a *lie waiting to happen*. The client may only send: “I want to
do X to Y”. The server validates X is possible for this player against
*server* state (distance, line of sight, cooldown, mana, ownership, weight,
capacity) and computes all results, including all RNG (loot rolls, damage
rolls, crits) — never accept a client-provided random value or damage number.

### 6.2 Item duplication, specifically

Dupes historically come from a handful of patterns — design each away:

- **Two homes for one item.** Item state lives in exactly one place (the
  `items` table + its in-memory mirror). No code path may copy an item and
  delete the original as two separate steps; “move” is a single atomic
  operation with ownership re-checked inside it.
- **Race conditions.** Two intents touching the same item in the same tick
  (move it into two containers, sell it while trading it) must serialize:
  process intents one at a time in the tick loop; re-validate the item’s
  location/ownership at execution time, not enqueue time. Never `await`
  mid-mutation of shared state (Node makes this easy to get wrong — do DB
  writes after the in-memory mutation is complete and consistent, or make the
  whole operation a queued job).
- **Save/crash timing (the classic MMO dupe).** If state is saved per-player,
  a player trades gold away, the *recipient* saves, the server crashes before
  the *giver* saves → gold exists twice after restore. Fix: ownership
  transfers commit atomically in one DB transaction at the moment they happen,
  independent of the periodic player-save cycle.
- **Login/logout edges.** One session per character, enforced server-side;
  a character’s items load once, lock while online, and other systems (market,
  house rent) touch offline characters only through the DB, transactionally.
- **Rollback abuse.** If you ever restore a backup, expect players to have
  moved items to friends before the snapshot point. Keep an `audit_log`
  (append-only: who moved what item where, when, trade partners) so restores
  can be reconciled and dupers identified.
- **Detection net.** Nightly job: `SUM(count)` of gold and rare item counts
  over time; alert on discontinuities. Give every non-stackable rare a unique
  serial id so a duped item is *visible* (two items, same serial).

### 6.3 Protocol hardening

- Validate every inbound message against a zod schema; unknown type, wrong
  field, out-of-range id → drop (and count strikes → disconnect/ban).
- Hard caps: max message size, max messages/second per connection, max
  connections per IP. Disconnect on breach; game actions additionally obey
  *game-rule* rate limits (server-enforced cooldowns, walk speed, exhaust) —
  the client’s cooldown UI is a convenience, the server’s is the law.
- Movement: server recomputes path legality per step (walkable, adjacent,
  speed vs. ground `groundSpeed`); teleports/large deltas are rejected.
  This kills speedhacks and walk-through-walls even if the client is modified.
- IDs are server-assigned; never index into arrays with raw client input
  (guard against negative/huge indexes — a classic RCE/corruption vector in
  original Tibia servers was malformed container/slot indexes).

### 6.4 Accounts & auth

- TLS everywhere (`wss://`); the login endpoint returns a short-lived session
  token, the game socket authenticates with it once, then it’s bound to the
  connection.
- Passwords: argon2id, per-user salt. Rate-limit and lockout on failed logins;
  optional TOTP 2FA later (Tibia players expect it — account theft is the #1
  real-world attack on these games).
- Never trust the client with another player’s account/character ids;
  authorize every action against the session’s character.

### 6.5 Information hiding (anti-ESP / maphack)

Only send what the player can legitimately see: creatures/items within the
viewport, no HP of creatures out of range, no contents of other players’
inventories, no monsters behind walls if you later add line-of-sight. A
modified client can only reveal what the server already sent it — so send
little. (This is also your bandwidth optimization; same code path.)

### 6.6 Bots & automation

Unwinnable in the limit, but raise the cost: server-side exhaust on all
actions, no gameplay-relevant information in timing side channels, detect
inhuman regularity (24h uptime, perfect reaction times, identical
click-intervals) and flag for review rather than autoban. Keep detection
signals server-side (never tell the client why it was flagged).

### 6.7 Operational safety

- No daily global-save dependency: ordinary character state persists within a
  bounded interval, economy/ownership changes commit immediately, scheduled
  world work is durable and idempotent, and restart rebuilds transient indexes
  from durable state.
- `audit_log` for every economically meaningful event (trades, market, drops
  of rares, gold sinks/sources) — append-only, partitioned by day.
- Automated backups + tested restore; point-in-time recovery (WAL) so a dupe
  incident can be surgically rolled back.
- Parameterized SQL only (any query builder does this; never string-concat).
- Structured logs + metrics (tick duration, msgs/s per conn, DB queue depth);
  most exploits show up as an anomaly in one of these before players report.
- Secrets in env vars, server not run as root, game port behind a proxy that
  can absorb TCP floods; consider Cloudflare Spectrum or similar if DDoS
  becomes real.

## 7. Suggested stack

| Concern | Pick | Why |
|---|---|---|
| Server runtime | Node 22 + TypeScript | shared types with client |
| WebSocket | `ws` now, `uWebSockets.js` if CPU-bound | simple → fast |
| Message schema | zod (JSON) now, flatbuffers/protobuf later | validation = security |
| DB | Postgres 16 | ACID is the anti-dupe weapon |
| DB access | Drizzle or Kysely (typed SQL) | transactions stay visible, no ORM magic |
| Password hashing | argon2id (`argon2` package) | current best practice |
| Monorepo | npm workspaces: `client/`, `server/`, `protocol/` | shared message types |

## 8. Milestone checklist

- [x] Monorepo restructure (`client/`, `server/`, `protocol/`), `git init`
- [x] Server tick loop + WS + zod protocol; echo world, two browsers see each other walk
- [ ] Move combat/AI/spells server-side; client = renderer + prediction
- [x] Postgres: accounts, characters, login flow, persistence of position/stats
- [ ] Items & containers with transactional moves + audit log
- [ ] NPC shop + player trade (both fully transactional)
- [ ] Rate limiting, session hardening, TLS, backups + restore drill
- [ ] First Canary content import (monsters/loot/spell numbers)
- [ ] Playtest with friends; watch `audit_log` and metrics for surprises
