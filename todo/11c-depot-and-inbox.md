# Depot and inbox

Part of [`11-economy`](11-economy.md). Depends on atomic
[`items`](05-items-and-inventory.md); the `depot` and `inbox` item locations
already exist in the schema.

## Depot and inbox

- [x] Add account/character depot ownership and bounded containers keyed by
  server-known town/depot ids.
- [x] Authorize opening at a visible/reachable depot object; once opened, every
  move still validates session, container revision, slots, capacity, and owner.
- [x] Define inbox/mail delivery ownership, limits, expiry/return rules, and
  offline transactional behavior without loading an offline live aggregate.
- [x] Match pinned depot search/retrieval, inbox, mailbox, supply stash, reward
  delivery, and town/depot behavior with bounded authorized projections.

## Planned file surface

- Migrations for depot/inbox metadata.
- Server: `server/src/depot/DepotService.ts`.
- Protocol/client: depot intents/projections and a focused accessible panel.

## Required exploit tests

- [x] Depot access from an unreachable/wrong-town depot object is rejected at
  execution time.
- [x] Concurrent moves against one depot slot leave exactly one item per slot.
- [x] Offline inbox delivery commits transactionally and cannot duplicate items
  when retried.

## Known gaps (memory-resident depot, 2026-07)

Depot/inbox/stash state for online characters is memory-authoritative (Canary
model): loaded once at login, mutated synchronously in the tick, persisted
behind via a per-character FIFO of guarded single-transaction writes.
Deliberate trade-offs, with reasons and recommended fixes:

- **Depot mutations are acknowledged before the DB commit.** Same-owner
  relocations only (deposit/withdraw/stash); cross-character flows (mail,
  reward, expiry) remain commit-first. A crash between memory-apply and
  persist loses that mutation (item stays at its pre-mutation DB location) —
  no dupe is possible because the DB write is one guarded transaction and
  memory is rebuilt from the DB at login. Accepted for Canary-parity latency.
- **Persist failure disconnects the player.** A guarded write that misses
  (external interference or DB outage) poisons the character's persist queue,
  skips the remaining writes, and terminates the session so the next login
  reloads authoritative DB state. Recommended fix if it becomes visible in
  practice: live resync (reload inventory + depot caches in place) instead of
  disconnect.
- **`runSerializableTransaction` does not retry on serialization failures
  (40001).** Mail/expiry transactions racing a persist write can fail
  spuriously and surface as `mail-action-failed: failed` (client may retry) or
  a persist-failure disconnect. Recommended fix: bounded retry loop for 40001
  in `runSerializableTransaction`.
- **Expiry returns race an online recipient's in-memory withdraw for ~1 tick.**
  The expiry scan works commit-first; the recipient's cache learns about the
  removal one outcome-application later. A withdraw of the just-returned item
  in that window fails its persist guard and triggers the disconnect/resync
  path. Harmless at 30-day expiry granularity; revisit only if expiry cadence
  ever tightens.
- **Mid-login deliveries buffer for up to 60 s.** `DepotCacheManager` buffers
  external deliveries between `beginLoad` and `attach` and replays them on
  attach (id-keyed upserts make replays idempotent). If a login aborts after
  `beginLoad`, the buffer expires via TTL rather than an explicit abort hook.

[Back to overview](README.md)
