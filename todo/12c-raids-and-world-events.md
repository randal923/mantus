# Raids and world events

Part of [`12-quests-and-world-actions`](12-quests-and-world-actions.md).
Depends on the [`creature/spawn runtime`](04-creatures-spawns-and-ai.md) and
[`12b-world-actions`](12b-world-actions.md) for event action steps.

## Raids and world events

- [ ] Define scheduled/global events as typed state machines with stable event
  ids, bounded work per tick, announcements, spawn/action steps, and completion.
- [ ] Make durable events restart-safe and idempotent. A restart cannot create
  rewards or bosses twice.
- [ ] Drive daily resets, rewards, raids, and event start/end boundaries from
  durable server-clock schedules with idempotency keys or leases. Never use
  process startup or a daily global save as the event trigger.
- [ ] Add operator controls and audit entries for starting/canceling high-impact
  events.

## Planned file surface

- `server/src/event/WorldEventManager.ts` and durable schedule persistence.

## Required exploit tests

- [ ] World-event restart/retry does not duplicate spawns or rewards.
- [ ] Crossing a daily boundary while the server remains continuously online
  produces the same result as crossing it during a restart.
- [ ] Operator event controls are authorized and audited.

[Back to overview](README.md)
