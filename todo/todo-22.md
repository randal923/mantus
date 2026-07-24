# Todo 22 — Performance follow-ups

The 2026-07-24 optimization pass landed (see [done](done.md)): visibility broadcast dedup and serialize-once, tile-states batching, non-allocating occupancy checks, `findPath` parent-pointer reconstruction, first-visible-floor cache, per-tick queue drains, equipment/stats memoization, dirty-tracked skills/storage saves, client HUD re-render isolation, shared outfit texture cache, and atlas-based combat effects. Everything remaining here was deliberately deferred and is **measure-first**: do not implement any of these items without profiling or load data showing they matter. Feature 106's server items should wait for Feature 100's staging capacity measurements; Feature 107's client items need welcome/depot parse timing and frame profiling first. The effects/missiles-above-onTop rendering deviation is tracked in the rendering area (todo-4), not here.

## Remaining features

- [ ] **Feature 106 — Server performance deferred items** — Pool sizing, `MonsterBrain.acquireTarget` single-pass selection, batched character-creation inserts, chat name index, condition-tick cloning, permessage-deflate — each gated on load measurements. See [implementation](implementation-feature-106.md).
- [ ] **Feature 107 — Client performance deferred items** — Web Worker parsing for large payloads, `WorldRenderer` per-frame allocation elimination, `MapView.tileItems` memoization — each gated on profiling. See [implementation](implementation-feature-107.md).

[Back to overview](README.md)
