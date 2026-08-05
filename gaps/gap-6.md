# Gap 6: Performance harnesses can't gate server-side optimizations

**Severity:** medium (process — blocks measure-first server work)
**Verified:** 2026-08-05, by attempting to A/B two server optimizations.

## Evidence

1. `server/src/playtest/scenarios/monsterCapacity.ts` asserts nothing — it
   prints latency percentiles and always exits 0 (or crashes, see 2).
2. The 1900-monster stage aborts the whole run when a spawn lands short
   (`/spawn butterfly 400` → `Spawned 398/400` → hard `Error`), which happens
   often because earlier butterflies wander onto the spawn tiles. Two of four
   runs today died this way, losing the combat-stage numbers too.
3. Run-to-run variance in turn latency (p95 at the 1500 stage: 42.8–49.4 ms
   across identical baselines) is larger than the effect size of most single
   optimizations, so keep/discard decisions cannot be made from one run.
4. Every load scenario drives **one** player. Costs that scale with viewer
   count — `World.playersWhoCanSee` (all-players scan per broadcast),
   per-candidate `canSee` in monster targeting, broadcast serialization —
   are almost absent from the measurement. A canSee-caching change measured
   today moved tick p99 by ~0 because a single-player world performs ~400
   uncached canSee calls/second (~0.03 ms/tick).
5. The production server exposes no tick timing at all (`TickLoop` is a bare
   `setInterval`); only the load-test servers report event-loop delay, and
   only once per second.

## Recommended fix

- Accept a small tolerance in the spawn count (`>= 95%`) instead of aborting.
- Add an env-tunable p95 gate to `monsterCapacity` (copy `playerCapacity`).
- Add a combined players+monsters stage (even 20 synthetic players around the
  monster hotspot changes the broadcast math completely).
- Instrument `GameServer.tick()` with a fixed-slot per-phase accumulator and
  expose rolling p50/p99/max on `LOAD_SERVER_METRICS` — this was Phase 0 of
  the 2026-07-31 optimization plan and everything else depends on it.
