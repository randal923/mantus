# Feature 36 — completed

Chat observability and moderation metadata, from
[implementation-feature-36.md](../implementation-feature-36.md).

Cross-links: [implementation-feature-36.md](../implementation-feature-36.md) ·
[todo-10.md](../todo-10.md) · [docs/moderation-retention.md](../../docs/moderation-retention.md).

---

## 2026-07-25 — Flood metrics, configurable limits, escalation decay, retention policy

**Problem.** `ChatRateLimiter` enforced Canary's message buffer and escalating
mutes but emitted no observability at all, hard-coded every limit, had
undocumented restart semantics for its escalation counter, and there was no
retention policy for the moderation metadata the enforcement path writes.

**What changed.**

- `server/src/chat/ChatFloodMetrics.ts` (new) — counters for accepted lines,
  drops while muted, mutes issued per escalation level, total muted time, and
  escalation decays. Emits one `console.warn` per mute carrying only
  `character`, `level`, `durationMs`. The limiter is never handed a message
  body, so "no chat content is ever logged" is structural, not a convention.
- `server/src/chat/ChatFloodLimits.ts` (new) — the limits as a typed value with
  Canary defaults, plus `escalationDecayMs`.
- `server/src/chat/ChatRateLimiter.ts` — takes limits + metrics; the escalation
  counter now decays one level per quiet `escalationDecayMs` window, applied
  lazily on the next line and measured from the last escalation so a long
  absence cannot wipe it in one step.
- `server/src/config.ts`, `loadServerConfig.ts`, `config.yml` — a validated
  `chat` section (`bufferCapacity`, `bufferDrainMs`, `muteBaseMs`,
  `escalationDecayMs`) and `moderation.retentionDays`.
- `server/src/chat/ChatHandler.ts` — accepts the limits, exposes
  `floodMetrics`; `GameServer` passes `config.chat`.
- Retention: `pruneModerationRetentionQuery.ts` (new),
  `ModerationStore.pruneRetention`, Pg + memory implementations, and an hourly
  bounded pass from `ModerationService.tick` wired into the game loop. The
  query never prunes state that is still enforcing something — an unexpired
  mute, a permanent ban, or an unreviewed report survives regardless of age.
- `docs/moderation-retention.md` (new) — what is stored, the retention rule per
  table, and an explicit statement that chat bodies are never stored.

**Files touched.** `server/src/chat/{ChatFloodMetrics,ChatFloodLimits,ChatRateLimiter,ChatHandler}.ts`,
`server/src/config.ts`, `server/src/loadServerConfig.ts`, `config.yml`,
`server/src/GameServer.ts`, `server/src/moderation/{ModerationService,ModerationStore,PgModerationStore,MemoryModerationStore}.ts`,
`server/src/moderation/sql/pruneModerationRetentionQuery.ts`,
`docs/moderation-retention.md`, plus test-config fixtures.

**How it was verified.** `server/src/chat/ChatRateLimiter.test.ts` (7 cases:
capacity, config-driven capacity, quadratic escalation surviving relog, decay,
decay bounded by earned levels, metrics contents with the exact log line, per
-character isolation), `server/src/moderation/ModerationRetention.test.ts` (3
cases: only-expired pruning, one bounded non-overlapping pass per interval, safe
without a store), and a `loadServerConfig` case rejecting an out-of-range
`chat.bufferCapacity`. Full server suite green.

**Residual risk.** Escalation state is memory-only and resets on restart —
accepted deliberately and recorded in `TODO.md` under "Accepted gaps" with the
fix if abuse ever warrants it.
