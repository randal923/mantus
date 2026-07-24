# Feature 14 — Client walk-then-use auto-retry

Part of [Todo 6 — Items and inventory](todo-6.md).

## Why

Canary auto-walks the player adjacent to an out-of-reach use/pickup target and retries; we hard-fail the action. Pure QoL, entirely client-side — server reach checks stay authoritative.

## Remaining work

- On an out-of-reach use/pickup, auto-walk adjacent to the target and retry the action once; the server's reach validation remains the real check.

## Implementation

- Client-only: on `item-action-failed` reach errors — or preemptively via the precheck in `/home/randal/code/tibia/client/lib/inventory/validateItemOp.ts` — issue walk intents through `/home/randal/code/tibia/client/lib/net/GameClient.ts` and retry the original action once on arrival.
- No server changes; no client-side reach decisions are trusted (charter golden rule).

## Tests

- Client test: out-of-reach use triggers walk intents and exactly one retry; a second failure does not loop.

## Dependencies

- None.
