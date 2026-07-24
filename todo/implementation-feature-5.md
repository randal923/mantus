# Feature 5 — Asset cache-busting for objects.json and atlas sheets

Part of [Todo 4 — Rendering and animation](todo-4.md).

**Completed 2026-07-24.** `tools/importTibiaAssets.mjs` now emits a
content-hash `version` into a no-cache `assets/manifest.json`, and
`client/lib/render/AssetStore.ts` appends `?v=<version>` to `objects.json`,
`atlas-index.json`, and the atlas sheets (unversioned fallback when the
manifest is absent). Full record, files touched, and verification in
[completed/implementation-feature-5-completed.md](completed/implementation-feature-5-completed.md).
