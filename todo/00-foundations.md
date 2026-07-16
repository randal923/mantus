# Foundations: generated content and migrations

This blocks generated-content imports and every persistence-heavy feature. See
the [audit overview](README.md) for pinned source versions.

## Generated content safeguards

- [ ] Pin the exact map, DAT/SPR, Canary commit, OTClient commit, converter
  version, and hashes in `content/source-manifest.json`. Conversion must fail
  when the assets/map/content eras do not match.
- [ ] Inventory and convert every pinned player-visible static definition into
  project-native, typed formats. Staged importers may enable a subset first,
  but their reports must retain every omitted entry and its owning parity TODO.
  Generated output must not require Canary or OTClient code at runtime.
- [ ] Never execute downloaded Lua during an import. If bulk importing is
  approved, parse only a whitelisted literal subset offline; reject callbacks,
  function calls, and unknown constants. Procedural monster/NPC scripts require
  a TypeScript implementation refactored for this server's tick and security
  model.

## Real migrations

- [x] Replace `server/db/schema.sql` as the ongoing migration mechanism before
      adding characters. Removed entirely — `001_accounts.sql` is byte-identical,
      so a separate snapshot would only drift.
- [x] Add `server/db/migrations/001_accounts.sql` for the existing table and a
      `schema_migrations(version, applied_at)` table.
- [x] Add `server/scripts/migrate.ts`; take a Postgres advisory lock, apply each
      numbered migration once in one transaction, and fail on a changed checksum.
- [x] Change root/server `package.json` scripts so `yarn db:migrate` is the only
      schema-changing command. Continue using Yarn.
- [x] Test migrate-from-empty and migrate-from-current-schema in CI
      (`.github/workflows/migrations.yml`); nothing runs migrations from the
      game tick — `yarn db:migrate` is the only entry point.

## Planned file surface

- New: `content/source-manifest.json`, `server/db/migrations/`,
  `server/scripts/migrate.ts`.
- Modify: `package.json`, `server/package.json`, `server/scripts/applySchema.ts`
  (remove after migration parity), `README.md`, `map/README.md`.

## Completion gate

- [ ] Generated content has a reproducible provenance manifest.
- [ ] A machine-readable parity inventory covers every pinned gameplay/content
  source and fails CI when a registered entry is missing, silently ignored, or
  lacks an owner in [`00a-canary-parity`](00a-canary-parity.md).
- [x] Migrations are serialized, transactional, checksummed, and covered by CI.
