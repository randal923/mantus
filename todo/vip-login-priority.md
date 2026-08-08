# VIP benefit: Login Priority (blocked as specified)

**Goal:** when the server is full, VIP (premium) players get priority.
Advertised on `/vip-account` with a "coming soon" badge.

**Blocker:** there is no login queue at all. At capacity
(`config.yml maxSessions`, `SessionRegistry.canAccept`) the socket is simply
closed (`GameServer.ts` connection handler) — no server-full message, no
waiting list, no position. A literal "priority in the queue" needs the queue
first.

## Recommended variant (deliverable without a queue): reserved slots

1. Config: `reservedPremiumSlots` (e.g. 5% of `maxSessions`).
2. `SessionRegistry.canAccept` gains a tier-aware check: free accounts are
   refused at `maxSessions - reservedPremiumSlots`; premium accounts are
   admitted up to `maxSessions`. Note the tier is only known *after* the
   auth handshake, so the capacity check must be re-run at auth time (where
   the account row is loaded) rather than only at socket accept.
3. Send a proper `server-full` error message (new protocol message with max
   size/rate defined in `protocol/`) instead of a bare socket close, so the
   client can display "World is full".

## Full queue (later)

Position-tracked waiting list with periodic `queue-position` pushes, premium
sorted ahead of free within arrival order, timeout on silence, and client UI.
Only worth building once the world actually hits `maxSessions` (2000).
