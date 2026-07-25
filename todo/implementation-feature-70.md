# Feature 70 — Outfits and addons

Shipped 2026-07-25 — see
[completed/implementation-feature-70-completed.md](completed/implementation-feature-70-completed.md)
for what landed and how it was verified. Only the items below remain.

Client-side work is tracked separately in [client/feature-70-outfit-picker.md](client/feature-70-outfit-picker.md).

## Remaining work

- Unlock sources: the store (Feature 43), quests (todo-21), and achievements
  (Feature 67) each need to call `OutfitService.grantOutfit`.
- The outfit-picker UI; `outfit-get` / `outfit-state` / `outfit-select` are in
  place for it.

## Dependencies

- Quest/achievement unlock sources (todo-21 quests, Feature 67 achievements, Feature 43 store).
- Feeds Feature 71 (mounts reuse the entitlement pattern).
