# Todo 11 — Client engineering: resilience, polish, performance

**Features 87, 88, 90, 91, 92, 107.** The engineering tracks that involve
protocol additions, architecture, investigation, or measure-first gating.
Pure "server ships, panel missing" work lives in
[`todo/client/`](client/README.md) instead. Done so far: freeze diagnostics
(server tick and headless client proven clean; probes retained:
`yarn playtest:tick-stall`, `client/e2e/gameFreeze.e2e.test.tsx`) and the
2026-07-24 perf pass (see [done.md](done.md)). Order: Feature 90 first — its
revisioned stream and state machine are prerequisites for 91/92; 92's
taxonomy/reporter half lands alongside Features 94/95 (todo-12).

## Feature 90 — Session resync and reconnect

Today the client has a loose `status: "connecting"` string and a bare
`reconnect(characterId)` (~line 374 of `createGameWindowStore.ts`) — no
backoff, no state machine, no snapshot/revision protocol; any drop risks
divergent or duplicated client state.

**Remaining work**

- *Revisioned world stream + snapshot/resync protocol:* session/stream id +
  monotonic revision on server messages; client ignores events from
  superseded connections; bounded full-own-state and visible-world snapshot
  messages plus revisioned deltas; on a revision gap stop applying dependent
  deltas and request resync — never guess item ownership, combat state, or
  position; idempotency keys only where retryable durable ops need them
  (movement/combat intents are never blindly replayed).
- *Explicit connection state machine:* connecting/authenticated/
  character-select/entering/online/reconnecting/kicked/fatal replacing loose
  strings; capped exponential reconnect with jitter + cancellation; on
  reconnect re-authenticate, re-claim under the one-session rule, rebuild
  from the snapshot; clear pending prediction, drag reservations,
  target/cooldown decoration, open private containers, transient effects;
  token expiry/refresh without ever logging tokens.
- *Regression suite:* disconnect-during-X matrix (movement, floor change,
  item transfer, combat, death, trade, travel) converges to committed server
  state; late packets from the old socket rejected; duplicate/out-of-order
  deltas trigger ignore/resync; reconnect duplicates no handlers, tickers,
  sprites, or intents.

**Implementation:** protocol first — revision/stream-id fields in
`protocol/src/serverMessages.ts`; stamp outbound in `server/src/Session.ts`
+ `GameServer.ts`; extend the welcome payload into a requestable resync
message. Client: `client/lib/net/GameClient.ts` tracks last-applied revision
and gates deltas; `createGameWindowStore.ts` status becomes a typed union;
backoff in `GameClient.ts` or a sibling connection manager; the optimistic
queue and movement prediction get a `clearTransient()` invoked on reconnect.
Playtest scenarios extend the `PlaytestClient.ts` `banker-relogin` pattern.

## Feature 91 — Client state boundaries and bounded resources

Caches and Pixi display objects have no explicit bounds or ownership rules;
long sessions with repeated region/floor changes can leak, and gameplay
state can silently migrate into render objects.

**Remaining work:** key server entities by stable ids/revisions (Pixi
objects never become gameplay state); separate connection/domain state from
rendering and React panels (derive views, no effect-driven copies); bound
the map-region, message, effect, battle-list, and container caches; dispose
Pixi resources and listeners deterministically; surface rejected intents and
authoritative corrections without leaking server internals.

**Implementation:** LRU/size caps + disposal tied to floor/region changes in
`client/lib/render/WorldRenderer.ts` / `MapView.ts` (reuse the
`passabilityRevision` invalidation pattern); domain/render separation in
`GameClient.ts` + `createGameWindowStore.ts`; correction surfacing via
`GameNotifications.tsx`. Depends on Feature 90's stable-id/revision keying.

**Tests:** resource counts stay bounded through repeated region/floor
changes (e2e assertions); corrections produce the intended UI.

## Feature 92 — Client error handling and diagnostics

Client failures are mostly silent: no bootstrap failure UI, no
malformed-message policy, no typed taxonomy, no redacted reporting.

**Remaining work**

- *Periodic freeze investigation (environment-specific):* a ~20–30 s
  periodic freeze remains in dev play — suspects: `next dev`/HMR, browser
  extensions/devtools, GPU/driver vsync, the WSL2↔Windows boundary. Run the
  long-task/heap observer snippet from `gameFreeze.e2e.test.tsx` in a real
  session's devtools; correlate with HMR/GPU logs. Keep both probes as
  regression gates. Measurement task, not code.
- *Bootstrap/network/render error handling:* catch dynamic import, Pixi
  init, asset preload, map manifest, initial render failures → retryable vs
  fatal UI + exactly one bounded diagnostic; WS `error` + close codes,
  connection/auth/entry deadlines, invalid JSON/schema with a bounded
  violation policy; HTTP status + runtime-schema checks with abort/timeout,
  capped jittered retry, visible fallback (no silent empty regions); error
  boundaries and a safe logout/retry path from every failure state.
- *Taxonomy + redacted diagnostics + source maps:* typed error taxonomy;
  redacted reporter carrying build, phase, category, attempt, server
  correlation id; never tokens, raw messages, private state; production
  source maps uploaded privately; error groups tied to release metadata.

**Implementation:** malformed-message strike policy in `GameClient.ts`;
bootstrap handling at the game-window mount; fetch handling in `MapView.ts`
+ asset loaders; React error boundaries at the game-window route (Next
`error.tsx`); taxonomy/reporter as a new `client/lib/` module posting to
Feature 95's rate-limited ingestion endpoint with Feature 94's correlation
ids; source-map upload in the Next build.

**Tests:** each failure produces the intended UI + exactly one redacted
diagnostic with no unhandled rejections; malformed messages, stale build,
telemetry outage stay bounded and recover; redaction tests.

## Feature 87 — Client polish (lighting, sound, input, HUD, modals, settings)

Polish is display-only — any gameplay-affecting control sends a bounded
intent, and settings that look persistent must persist.

**Remaining work:** lighting/day-night cycle, item/creature light sources,
floor darkness; sound/music — nothing audio exists (the Feature 21 potion
sound was built and removed at the product owner's request): real assets
first, then playback + volume/mute + unlock-on-first-gesture; hotkeys,
action bars, targeting, mouse/touch input, context menus, drag feedback,
keyboard accessibility (current settings key mapping and bottom spell bar
are visual previews — persist validated bindings); battle-list filters,
party frames, status icons, combat log, loot channel, quest tracker,
notification UX; generic bounded modal windows + typed answers for Canary
modal-driven interactions (no open-ended server UI evaluator; protocol
schema first); settings persistence/localization/accessibility
(`GameMenuModal.tsx` keeps language/volume/hotkey changes only while open).

**Implementation:** lighting in `client/lib/render/WorldRenderer.ts`;
settings via the bounded `accounts.ui_settings` schema or localStorage as
appropriate; hotkey/action-bar persistence reuses the
`023`/`029` migration patterns; modal answers typed and validated against a
bounded schema.

**Absorbed residuals (2026-07-26, from Feature 78's client surfaces):**

- The imbuement hover badge (`ItemSlot.onImbue`) is only wired for
  backpack/container slots; equipped items in `EquipmentPaperdoll` have no
  imbue affordance and must be unequipped first.
- `ImbuementModal` shows `remainingSeconds` as sent; it does not tick down
  client-side between `imbuement-window-state` pushes.

**Absorbed residuals (2026-07-26, from Features 82/83's client surfaces):**

- `ProficiencyModal` shows an XP threshold only on the next locked level
  (the server's `nextLevelExperience`); deeper locked rows say "Locked"
  because the weapon's XP family (crossbow/knight/standard) is not
  derivable client-side — fix by projecting the family or per-level
  thresholds into `proficiency-state`.
- The Cyclopedia combat sub-tab fetches on first visit only; it does not
  refresh while open when equipment changes (revisit/reopen refetches) —
  fix with a server push or a refetch-on-equipment-revision hook.
- Animus mastery renders as a bestiary-header chip and a per-monster
  sheet line; there is no dedicated list of mastered races by name.

**Tests:** persisted bindings survive relogin; settings stick after closing
the modal; no polish path introduces a client-enforced-only limit.

## Feature 88 — Client performance budgets and streaming

**Remaining work:** formal budgets for region streaming, sprite count,
animated items, effects, UI updates, low-power behavior (definitions
coordinate with Feature 107); sheet-upload hitch — sheets streaming in while
walking upload to the GPU on first draw (fix: `renderer.texture.initSource`
inside `AssetStore.loadSheet`, or compressed textures); region re-entry cost
(`MAX_CACHED_REGIONS = 48`) — consider prefetching regions adjacent to the
walk direction.

**Tests:** frame-time regression check for the first-draw hitch after the
`initSource` fix.

## Feature 107 — Client performance deferred items (measure first)

Deferred from the perf pass; profile before implementing any of it.

- `GameClient` parses every frame with `JSON.parse` + zod on the main
  thread; big payloads (welcome, depot browse, market lists) could parse in
  a Web Worker — measure welcome/depot parse timing first.
- `WorldRenderer` per-frame loop allocates ~8 short-lived objects per
  creature per frame — scratch objects, numeric elevation-cache keys, a
  per-view dirty flag; verify with the headless screenshot harness.
- `MapView.tileItems` recomputes merge+sort per query; `applyCover` calls it
  repeatedly per own-player step — memoize per `tileKey`, invalidated by the
  same events that call `redrawTileKey` (unit-test the invalidation).

Coordinate with Feature 91's cache bounding (same files). Record
before/after profiling numbers for each landed item.

[Back to overview](README.md)
