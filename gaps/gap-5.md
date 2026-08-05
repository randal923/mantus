# Gap 5: Login runs ~35 strictly-sequential DB round trips

**Severity:** high (user-visible latency: ~1.6–2 s per login at the current
~45–60 ms cross-region RTT to Supabase)
**Verified:** 2026-08-03 code audit (recorded in the recovered
`todo/optimization.md` §3, re-checked against `git show 99db5b2~1`); still open
as of 2026-08-05 — no `loginSnapshotQuery` exists and world-entry loads remain
serialized on `LoginLoadQueue`.

## Evidence

World entry issues one query per subsystem (character, skills, storage, items,
depot, bank, outfits ×2, vips ×2, friends ×4, gems/wheel ×4, prey, hunting
tasks, profile ×4, …) sequentially through the login queue. Each pays a full
network round trip.

## Recommended fix

Collapse into 1–2 statements with `json_agg` scalar sub-selects (the pattern
`server/src/depot/sql/storedStateQuery.ts` already establishes). Cheap
independent merges alone (gems+wheel 4→1, friends 4→1, profile 4→1,
outfits 2→1, vips 2→1) save ~15 round trips without restructuring anything.
Co-locating the database with the Fly region is the other half of this fix and
multiplies with it.
