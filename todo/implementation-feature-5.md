# Feature 5 — Asset cache-busting for objects.json and atlas sheets

Part of [Todo 4 — Rendering and animation](todo-4.md).

## Why
After an asset re-rip, users get stale sprites until a hard refresh — the sprite catalog (`objects.json`) and atlas sheets have no content-hash versioning, unlike map regions and minimap tiles which already cache-bust via the manifest.

## Remaining work
- `/assets/*` is browser-cached 24h via next.config headers (`Cache-Control: public, max-age=86400, stale-while-revalidate=604800`).
- Map regions/minimap tiles are cache-busted via a manifest `version` content hash (manifest fetched with `cache: "no-cache"`), but `objects.json` and atlas sheets have no versioning.

## Implementation
Extend the existing manifest-hash pattern:
- `tools/importTibiaAssets.mjs` emits a content hash for `objects.json` + atlas sheets into the no-cache manifest.
- `client/lib/render/AssetStore.ts` appends the hash as a query param (or uses a hashed filename) when fetching those assets.

Client-only change; no server or protocol impact.

## Tests
- Asset-loading test asserting the versioned URL derives from the manifest hash.

## Dependencies
- None.
