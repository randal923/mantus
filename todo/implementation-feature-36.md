# Feature 36 — Chat observability and moderation metadata

Part of [Todo 10 — Chat and channels](todo-10.md).

## Why
The chat rate limiter enforces floods and escalating mutes but emits no observability, and its escalation state has undocumented restart semantics. Moderation needs metadata without ever logging chat bodies.

## Remaining work
- Flood/spam metrics for `ChatRateLimiter` mutes — currently no observability at all.
- Mute/exhaust escalation state is in-memory only: it survives relog but resets on restart. Either persist it or accept the limitation explicitly (record in TODO.md if accepted).
- Buffer capacity is hard-coded, not configurable.
- Keep reporting/muting/audit metadata separate from gameplay chat payloads.
- Moderation retention policy undefined.

## Implementation
- Add counters/log events around `server/src/chat/ChatRateLimiter.ts` — mute issued, escalation level, message drops — without ever logging message bodies (shipped invariant: chat bodies are never logged; charter rule 9's spirit applies).
- Optionally persist escalation keyed by character with a decay column so restarts do not reset repeat offenders.
- Lift buffer capacity into server config.
- Moderation metadata (reports, mute records) as a separate message/store, never piggybacked on gameplay chat payloads or sent to other players (charter rule 6).
- Define and document a retention policy for moderation records.

## Tests
- Metrics emitted on mute/escalation/drop contain no message content.
- Persisted escalation (if chosen) survives restart and decays on schedule.
- Config-driven buffer capacity respected; oversize still rejected server-side.

## Dependencies
- Feature 94 (logging) and Feature 95 (metrics) for the observability plumbing conventions.
- Feature 35 extends the surfaces these metrics must cover (channels, talkactions).
