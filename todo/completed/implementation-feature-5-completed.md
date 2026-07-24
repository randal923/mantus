# Feature 5 — completed

Cross-links: [implementation-feature-5.md](../implementation-feature-5.md) ·
[todo-4.md](../todo-4.md).

---

## 2026-07-24 — Cache-busting for objects.json + atlas sheets

**Problem.** `/assets/*` is browser-cached 24h
(`Cache-Control: public, max-age=86400, stale-while-revalidate=604800` in
`client/next.config.ts`). Map regions/minimap tiles already cache-bust via a
no-cache manifest `version` content hash, but `objects.json`, `atlas-index.json`,
and the atlas sheets had no versioning — after a re-rip users kept stale sprites
until a hard refresh.

**What changed.**

- `tools/importTibiaAssets.mjs` — emits a single content version
  `assetVersion = sha256(datSha256:sprSha256).slice(0,16)` (the same
  source-hash shape the map pipeline uses for `mapVersion`) into a new
  `assets/manifest.json`, published in both the metadata-only and full paths.
  `objects.json` derives from `.dat`, atlas sheets + `atlas-index.json` from
  `.spr`, so this one hash covers the whole re-ripped bundle.
- `client/lib/render/AssetStore.ts` — `loadCatalog` now fetches
  `manifest.json` with `cache: "no-cache"` first, then appends `?v=<version>`
  to `atlas-index.json`, `objects.json` (via a new `assetUrl` helper), and each
  atlas sheet in `loadSheet`. Missing/malformed manifest → unversioned URLs
  (previous behavior), so old deploys keep working. `outfit-colors.json` is not
  part of the dat/spr bundle and is left unversioned.
- `client/public/assets/manifest.json` (new) — generated from the committed
  `objects.json`'s existing `source.{datSha256,sprSha256}` so cache-busting is
  active on the current assets immediately (version `42a6d742a808e4bc`), not
  only after the next re-import.

**Files touched.** `tools/importTibiaAssets.mjs`,
`client/lib/render/AssetStore.ts`, `client/lib/render/AssetStore.test.ts`
(new), `client/public/assets/manifest.json` (new).

**Verification.** `yarn workspace client test lib/render/AssetStore.test.ts`
→ 3 passed (versioned objects/atlas-index/sheet URLs derive from the manifest
hash; manifest fetched no-cache before the catalog; unversioned fallback when
manifest absent). `yarn workspace client typecheck` clean.

**Residual risk.** None significant. Client-only, no server/protocol impact. If
`importTibiaAssets.mjs` is ever run with a stale `.spr`/`.dat` pair the version
still tracks the source bytes correctly.
