# Gap 3: Postgres pool has no statement/idle-in-transaction timeouts

**Severity:** medium (availability)
**Verified:** 2026-08-05, `server/src/index.ts:93-97`

## Evidence

```ts
const pool = new Pool({
  connectionString: databaseUrl,
  max: postgresPoolMax,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});
```

No `statement_timeout`, no `query_timeout`, no
`idle_in_transaction_session_timeout`, no `keepAlive`, no `application_name`.
One stuck query (or an abandoned SERIALIZABLE transaction) pins one of the
pool's connections forever; a few of them exhaust the pool and stall every
login and save. Cross-region RTT to Supabase makes long-hanging statements
more likely, not less.

## Recommended fix

- `statement_timeout` ~10 s and `query_timeout` slightly above it.
- `idle_in_transaction_session_timeout` ~15 s.
- `keepAlive: true`, `application_name: "tibia-server"` for observability.
- Give the 5-minute conservation sweep its own client with a longer timeout so
  an intentionally heavy query is not killed by the gameplay limit.
