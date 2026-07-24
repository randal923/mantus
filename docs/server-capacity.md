# Capacity and performance report

Last validated: 2026-07-23

## Decision summary

The controlled Fly `performance-1x` envelope handled **4,000 concurrent
players at low steady-state latency** in the current lightweight-player
workload:

- 4,000 real WebSocket clients;
- every client authenticated, listed a character, entered the world, and
  remained connected;
- 960,800 actions over 120 seconds, or 7,999 actions/second;
- all players active at two actions/second;
- a repeating mix of turns, local speech, queued movement, and movement stops;
- 29.5 ms p50, 41.2 ms p95, 55.2 ms p99, and 121.9 ms worst response latency;
- 296.6 MB peak RSS and 146.8 MB peak JavaScript heap;
- 54.3 ms highest one-second event-loop p99 after the initial burst, with one
  isolated 109.4 ms maximum pause;
- no failed probes or disconnected clients.

The same test family reached 4,500 players with 77.9 ms p99, but with less
latency reserve. At 5,000 players, p99 rose to 125.1 ms and event-loop p99 to
152.2 ms. The recommended controlled-test limit is therefore **4,000**, not
5,000. The repository keeps the production admission default at 2,000 until a
staging run includes Supabase/PostgreSQL, TLS/Fly Proxy, the production map,
dirty saves, reconnects, and mixed combat.

The constrained server also remained responsive with **1,900 active monsters
in one physical hotspot**, the maximum that fit on the selected walkable
floor area:

- 42.9 ms turn-response p95 and 43.4 ms p99 at 1,900 test monsters;
- 416.1 MB peak RSS and 190.8 MB heap;
- 26.1 ms peak sampled event-loop p99 at the 1,900 stage;
- 23 confirmed deaths through a server-authoritative spell, rune, and
  auto-attack sequence.

This is a hotspot-density result, not a global monster limit. Offscreen
monsters use bounded, activation-aware AI work, so a distributed world can
hold more. A combined 4,000-player plus production-monster staging test is
still required.

## What the Docker result means

The final server image was run with:

```text
--cpus=1
--memory=2g
--memory-swap=2g
```

Inside the container the measured controls were:

```text
cpu.max=100000 100000
memory.max=2147483648
memory.swap.max=0
os.availableParallelism()=1
```

This accurately enforces one CPU worth of scheduler time, a 2 GiB memory
ceiling, and no swap. The image uses Node 24 on Debian Bookworm.

It does **not** turn the host's AMD Ryzen 9 7950X core into the exact CPU used
by a Fly host. CPU model, cache, virtualization, network, proxy termination,
and noisy-neighbor behavior can differ. Fly documents that `performance`
vCPUs receive a full CPU quota while `shared` vCPUs have a 6.25% baseline and
burst credit. A latency-sensitive 25 ms game tick belongs on a performance
Machine:
[Fly CPU performance](https://fly.io/docs/machines/cpu-performance/).

Treat the Docker number as a controlled capacity estimate and regression
baseline. Certify the final number by running the same generator from another
Machine against a real Fly deployment.

## Player capacity measurements

The load generator ran outside the constrained container so its own JSON,
timers, and 5,000 sockets did not consume the server's one-CPU/two-GiB budget.
Each player occupied a real protocol connection and used the production
session, schema validation, tick queue, player, world, spatial visibility,
movement, chat, and outbound transport code. Twenty players shared each local
area, modeling many separate hunting/meeting groups.

| Players | Activity rate | Steady p95 | Steady p99 | Worst | Exact all-player burst p95 | Peak RSS | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2,000 | 3,996/s | 33.8 ms | 36.3 ms | 40.1 ms | not retained | 241.5 MB | pass |
| 3,000 | 5,994/s | 38.0 ms | 42.2 ms | 58.5 ms | 218.0 ms | 270.1 MB | pass |
| 4,000 | 7,999/s | 41.2 ms | 55.2 ms | 121.9 ms | 273.2 ms | 296.6 MB | recommended tested limit |
| 4,500 | 8,942/s | 48.3 ms | 77.9 ms | 115.8 ms | 246.0 ms | 318.5 MB | boundary, little reserve |
| 5,000 | 9,875/s | 57.6 ms | 125.1 ms | 168.5 ms | 266.0 ms | 348.9 MB | fails p99 target |

The 4,000-player row is the two-minute final run. Other rows are shorter
capacity-search runs. The activity generator schedules work in 50 ms slices
and rotates evenly among:

1. a turn whose authoritative movement response is timed;
2. local `say` chat;
3. one queued movement step;
4. stop movement.

The exact burst asks every player to turn at almost the same instant. It is a
useful pathological fan-out test but not representative of steady gameplay.
It exceeds the sub-100-ms target even below the steady capacity boundary.
Reconnect storms and synchronized global events must therefore be admitted
and spread deliberately.

### What this player test does not include

- Supabase JWT verification or its network latency;
- PostgreSQL character loads, inventory loads, or periodic dirty snapshots;
- TLS/WSS and Fly Proxy;
- Internet packet loss or geographically distributed clients;
- 4,000 players in one viewport;
- full-map NPC and monster activity;
- inventory, market, trade, shop, loot, death, and economy traffic;
- slow clients consuming outbound data;
- a 30-minute or multi-hour soak.

It proves the in-memory authoritative runtime and WebSocket path can support
the measured workload. It does not yet prove the entire production stack can.

## Monster capacity measurements

The monster server ran inside the same one-CPU/two-GiB container. It loaded the
production OTSERVBR binary map, item and creature content, normal spawn
manager, monster AI, combat, visibility, and protocol paths. The load client
spawned Butterfly fixtures near one level-300 Sorcerer and timed 100
authoritative turns at every stage.

| Requested test monsters | Server monsters including normal spawns | Turn p95 | Turn p99 | Worst |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 106 | 26.8 ms | 27.4 ms | 27.5 ms |
| 300 | 306 | 31.9 ms | 32.6 ms | 32.6 ms |
| 500 | 506 | 32.4 ms | 36.0 ms | 36.0 ms |
| 1,000 | 1,006 | 37.4 ms | 38.2 ms | 38.2 ms |
| 1,500 | 1,506 | 38.1 ms | 42.5 ms | 42.5 ms |
| 1,900 | 1,906 | 42.9 ms | 43.4 ms | 49.0 ms |

The selected 65-by-49 area ran out of safe free tiles near 1,900. This stopped
the test before CPU or the 2 GiB memory limit did.

At the final combat stage:

- 23 monsters died;
- 22 monster-health updates were observed;
- 43 magic effects and 22 combat texts were observed;
- spell and rune kills were confirmed;
- the auto-attack target was acknowledged and held for five seconds;
- turn p95/p99 remained 37.5/42.7 ms;
- the server peaked at 416.1 MB RSS;
- no client-supplied damage, position, RNG, or death result was trusted.

Butterflies are deliberately cheap opponents. The next monster gate needs
hostile pathfinding, different combat abilities, summons, conditions, loot and
corpses, distributed inactive regions, and several nearby players.

## Client FPS and low-end rendering

Server capacity and client FPS are separate limits. The server does not render
sprites and does not benefit from the owner's RTX 4090. Each player's browser
renders its own view.

The browser test uses real headless Chromium, PixiJS, game assets, a real
server connection, maximum 32-by-24 protocol viewport, 100/300/500/1,000
known monsters, and authoritative spell/rune/auto-attack combat.

### Unconstrained host, CPU-only WebGL

Chromium identified the renderer as SwiftShader:

| Known monsters | Average FPS | p95 frame |
| ---: | ---: | ---: |
| 0 | 48.1 | 33.4 ms |
| 100 | 34.6 | 33.4 ms |
| 300 | 34.0 | 33.4 ms |
| 500 | 32.8 | 33.4 ms |
| 1,000 | 31.0 | 33.4 ms |
| Combat at 1,000 | 30.2 | 49.9 ms |

Combat confirmed 17 deaths and passed the 15-FPS/100-ms regression gate.

### Constrained CPU-only clients

The Playwright image had no GPU device. The real playtest server ran in a
separate Docker container, so the listed CPU/RAM cap applied only to the
Chromium/Pixi test process:

| Client profile | Empty | 100 | 300 | 500 | 1,000 | Combat | Gate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2 vCPU, 4 GiB, SwiftShader | 8.4 | 7.1 | 7.1 | 7.1 | 7.1 | 6.7 | fail |
| 4 vCPU, 4 GiB, SwiftShader | 16.4 | 14.2 | 14.3 | 14.2 | 14.2 | 13.4 | fail |

The almost flat count curve shows CPU software rasterization is already the
dominant bottleneck before monster count. A two-core machine without a usable
GPU is not a supported client target at this resolution/zoom.

### RTX 4090 limitation

The RTX 4090 was visible to CUDA (`nvidia-smi`) but not to Chromium graphics in
this WSL environment. `glxinfo` reported llvmpipe, normal Chromium used
SwiftShader, and the Vulkan launch profile made Pixi fall back to Canvas2D.
That fallback reached the 60 Hz requestAnimationFrame ceiling at every monster
stage, but it is **not an RTX 4090 benchmark**.

The GPU script now reports the actual canvas renderer and rejects
SwiftShader, llvmpipe, Canvas2D, or other software fallback. Run it from a
native OS/browser environment that exposes the GPU:

```bash
yarn test:monsters:gpu
```

The client changes that improved both CPU and GPU-capable paths are:

- creature-store updates from one server batch are applied once per animation
  frame instead of once per packet;
- server transport arrays are parsed and schema-validated in order;
- creature drawing order is cached until membership changes;
- the per-frame visual-position map allocation was removed;
- creature containers and name plates outside the actual canvas are culled
  with outfit-aware margins;
- the DOM battle list renders at most 24 rows.

Useful next client work is texture/sprite pooling, avoiding live Pixi display
objects for far-off known creatures, dynamic resolution, a lower effects
quality setting, reducing per-creature text objects, and profiling a native
integrated-GPU laptop plus a native RTX run.

## Request-to-result architecture

Every gameplay request follows this boundary:

```text
WebSocket frame
  -> 16 KiB frame limit and per-connection rate limit
  -> JSON parse
  -> shared Zod schema validation
  -> bounded per-session intent queue
  -> active-session set
  -> 25 ms authoritative tick
  -> execution-time ownership/range/cooldown/state validation
  -> synchronous in-memory mutation
  -> spatially filtered visibility projection
  -> shared serialization and ordered per-tick transport batches
  -> client schema validation and animation-frame state update
```

Socket callbacks parse and enqueue; they do not mutate gameplay state.
Gameplay mutations do not `await` midway through check-and-change logic. The
client sends intents, never trusted damage, position, speed, loot, price, or
RNG outcomes.

The main tick:

1. applies completed asynchronous database/auth/service outcomes;
2. processes disconnects and final persistence work;
3. checks only sessions still awaiting authentication for deadlines;
4. drains only sessions with queued intents or held movement;
5. runs combat, fields, conditions, auto-attack, action bot, and creature
   events;
6. runs bounded spawn and monster-AI work;
7. runs NPCs, decay, containers, depot, market, trade, party, guild, house,
   PVP, progression, and character persistence;
8. flushes ordered outbound batches.

The world remains one authoritative writer. Ordinary horizontal replicas
cannot safely mutate the same map/creatures. Future scaling beyond one fast
event loop requires explicit zones/worlds or workers limited to pure immutable
compute whose results are revalidated and applied inside the authoritative
tick.

## Optimizations now in the server

### Sessions and transport

- Sessions are indexed by session, character, account, and source IP.
- Duplicate account/character login is an indexed lookup, not a global scan.
- Authentication deadlines inspect only unauthenticated sessions.
- Intent/movement handling inspects only sessions that need a tick.
- Up to 128 server messages and 16 KiB are coalesced per ordered transport
  batch.
- Identical local broadcasts are serialized once and reused for every eligible
  viewer.
- A socket is terminated when its buffered outbound data would exceed 1 MiB;
  a slow client cannot grow memory without bound.
- Heartbeats and the five-connections-per-IP limit remain enforced.

One remaining transport optimization is to track only sessions with queued
output for the batch begin/flush pass; the current tick still touches all
connected sessions at those two cheap boundaries.

### Spatial visibility and maps

- An 8-by-8 tile spatial grid indexes players, monsters, NPCs, and occupied
  floors.
- Spectator/visibility broadcasts inspect intersecting cells, not every
  session.
- Each recipient still gets execution-time floor, range, PVP, and hidden-state
  filtering.
- First-visible-floor calculations are cached by creature position revision
  and dynamic-map revision.
- Map item movement sends only entering/leaving edge tiles instead of
  rebuilding the entire viewport.
- Dynamic map and combat-field revisions are monotonic and invalidate caches
  only when state changes.
- Creature field checks are cached by creature position revision and field
  revision.

Density still matters. An event observed by 2,000 people still has 2,000
logical recipients. If 2,000 people each generate a globally visible event,
the application cannot index away four million deliveries.

### Creatures and periodic systems

- Spawn checks, spawn attempts, AI scans, and AI work have separate per-tick
  budgets.
- AI uses one round-robin queue, not one timer per monster.
- Player proximity is spatially indexed.
- Inactive regions skip normal AI work.
- Pathfinding is capped at 96 nodes per search.
- Empty condition collections are skipped.
- Progression work runs on a 100 ms cadence with catch-up semantics.
- Monster event tile revisions use weak creature keys and update only on
  actual revision changes, avoiding an unbounded dead-creature cache.

Production creature budgets are:

| Work | Budget |
| --- | ---: |
| Spawn-slot checks/tick | 512 |
| Spawn attempts/tick | 8 |
| AI entries scanned/tick | 512 |
| AI work units/tick | 512 |
| AI think interval | 250 ms |
| AI activation range | 32 by 32 tiles |
| Pathfinding nodes/search | 96 |

The Canary checkout at commit
`a879c9312e34381e8eedf397b8ed44510698b689` was consulted for design
comparison. Its relevant ideas are dispatcher fairness slices, visible versus
background monster priorities, bounded queues, limited completion draining,
and applying worker results back on the authoritative dispatcher. This
TypeScript server uses its existing spatial grid and bounded round-robin work
instead of copying Canary's C++ worker design:
[Canary](https://github.com/opentibiabr/canary).

### Persistence

- Dirty/due character IDs are indexed; the server does not rescan every online
  player to find saves.
- At most eight character snapshots are started per tick, spreading a save
  boundary instead of creating thousands of promises at once.
- Independent world-entry reads are issued in parallel.
- Seven character skills are updated with one parameterized bulk query.
- All quest/storage values are replaced with one parameterized data-modifying
  CTE.
- Any number of new progression events is inserted with one parameterized bulk
  query and replay conflicts roll the whole snapshot back.
- A normal snapshot is five database round trips: `BEGIN`, character update,
  bulk skill update, storage replacement, `COMMIT`.
- A snapshot with progression events is six round trips.
- Snapshot version checks and progression-event IDs make stale/replayed saves
  fail atomically.
- The shared PostgreSQL pool defaults to 20 connections, accepts only 1-50,
  waits at most five seconds for connection establishment, and retires idle
  connections after 30 seconds.

At 4,000 continuously dirty players and a 30-second interval, the average is
about 133 snapshot transactions/second and 665-798 query round trips/second.
This arithmetic is why database network latency matters even though players
do not hold one connection each. It is not a measured Supabase throughput
claim.

## Actions, requests, and database behavior

| Family | Client intents/examples | Authoritative work | Typical database behavior |
| --- | --- | --- | --- |
| Authentication/session | auth, language, heartbeat | JWT verification, account/session binding, one session per character, bans and deadlines | account upsert/settings; remote JWKS is cached |
| Character selection | list, create, enter world | ownership, name/vocation/outfit validation, safe spawn, initial visibility | roster/load/login plus inventory, depot, PVP, bestiary, wheel and gem reads |
| Movement | move, turn, stop, auto-walk, viewport | adjacency, revision, walkability, occupancy, speed, floor/door/house checks | no query per step; position is snapshot-persisted |
| Combat | target, fight mode, spell, rune, potion, action bot | range/LOS, server RNG/formulas, mana, exhaust, item revision, area targets, conditions, death | ordinary hits stay in memory; consumables, durable items, loot/progression use guarded persistence |
| Items/containers | equip, unequip, move, split, pickup, drop, loot, rotate, write, use | ownership, revision, count, capacity, slot, range, and container-cycle checks | parameterized transactions/ordered persistence; disconnect on unrecoverable memory-first persist failure |
| Economy | bank, shop, market, trade, reward, depot/stash/mail | revalidate funds, stock, ownership and both transfer legs | row locks/serializable flows, atomic transactions, ledger/audit rows |
| Chat/social | say, whisper, yell, private, party, guild, VIP | mute/flood/range/membership/permission checks | usually none for local chat; guild/moderation/social state is persisted |
| NPC/travel | greeting, dialogue choice, buy/sell, travel, promotion | range, dialogue state, eligibility, funds and destination | transactional when money/items/status change |
| Houses/PVP | buy, transfer, kick, doors, skull/frags | access at execution time, eviction, rent, aggression rules | house ownership/rent/audit and durable PVP state |
| Catalog/progression | highscores, bestiary, wheel, gems | bounded projections and server-owned unlock rules | reads plus idempotent/versioned progress writes |
| Moderation/settings | report, mute/ban/kick, UI/action bar | authorization, bounded text, rate and target checks | parameterized moderation/account writes and audit history |

Application SQL is parameterized. Economy and ownership changes re-check and
commit all legs together. Audit records are written in the same transaction
where the security charter requires them.

## Network and exploit-safety limits

Per production connection:

| Limit | Value |
| --- | ---: |
| Inbound message | 16,384 bytes |
| Messages/second | 30 |
| Pending intents | 16 |
| Protocol violations before disconnect | 5 |
| Connections/source IP | 5 |
| Outbound socket buffer | 1,048,576 bytes |
| Server messages/transport batch | 128 |
| Viewport | 32 by 24 tiles |
| Auto-walk path | 128 steps |
| Chat line | 255 UTF-16 code units |

These caps remain in the optimized path. Performance changes did not move
damage, RNG, cooldowns, visibility, item ownership, or economy authority to
the client.

## Supabase versus Fly Managed Postgres

Do not switch databases solely because the in-memory runtime handled 4,000
players. The missing test is database latency and throughput, not an observed
Supabase failure.

For the current long-lived Node server:

1. keep Supabase if it can be placed close to the Fly region;
2. prefer its direct IPv6 connection for a persistent backend;
3. use the session pooler on port 5432 when direct IPv6 is unavailable;
4. start with `PG_POOL_MAX=20`, then size from pool wait, DB CPU, p95/p99 query
   time, connection limits, WAL and IOPS;
5. use SSL and never point load tests at production data.

Supabase documents direct connections as the best choice for long-lived
sessions and describes application-side pools as appropriate for long-lived
containers:
[Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).
It also recommends leaving connection headroom for Auth and other platform
services:
[Supabase connection management](https://supabase.com/docs/guides/database/connection-management).

The game and database should be geographically co-located. Supabase exposes
specific regions such as `us-east-1`, while Fly Managed Postgres and Machines
can both use `iad`:
[Supabase regions](https://supabase.com/docs/guides/platform/regions).

Switch to Fly Managed Postgres when on-Fly staging demonstrates that the
Supabase route or pool is the latency bottleneck, or when private same-region
networking and one operational vendor are worth the cost. Fly Managed
Postgres includes HA, backups, failover, monitoring, encryption and connection
pooling:
[Fly Managed Postgres](https://fly.io/docs/mpg/).

## Fly hardware and monthly cost

As of 2026-07-23, Fly's Ashburn price table lists:

| Resource | CPU/RAM | Monthly compute price |
| --- | --- | ---: |
| `performance-1x` | 1 performance vCPU, 2 GiB | $32.19 |
| `performance-2x` | 2 performance vCPU, 4 GiB | $64.39 |
| Managed Postgres Basic | shared-2x, 1 GiB | $38.00 |
| Managed Postgres Starter | shared-2x, 2 GiB | $72.00 |

Storage, egress, certificates, support and other services are additional.
Prices vary by region and can change:
[Fly pricing](https://fly.io/docs/about/pricing/).

Practical starting choices:

- **Lowest cost:** `performance-1x` plus the existing same-region Supabase
  project. Game compute is about $32.19/month before egress.
- **All Fly, below $100:** `performance-1x` plus Managed Postgres Basic is
  about $70.19/month plus database storage and egress.
- **More DB memory:** `performance-1x` plus Managed Postgres Starter is about
  $104.19/month plus storage/egress.
- **Safer game-process staging:** `performance-2x` is about $64.39/month. The
  current single authoritative tick will not scale linearly across two cores,
  but the second core provides runtime, GC, TLS/proxy/telemetry and future
  worker headroom.

For the measured runtime, 2 GiB is ample on memory: the 4,000-player test used
297 MB RSS and the 1,900-monster test used 416 MB. CPU/tick latency, network
fan-out and database latency will become limiting first.

Do not use a shared-CPU Machine for the main world just because it is cheaper.
Its sustained baseline quota is inappropriate for a continuously ticking,
latency-sensitive process. A GPU is also unnecessary on the server; rendering
belongs on player devices.

## Reproduction

Build the one-CPU server image:

```bash
docker build -f Dockerfile.performance-1x \
  -t tibia-performance-1x:final .
```

Start a 4,000-player fixture server:

```bash
docker run --name tibia-performance-soak \
  --cpus=1 \
  --memory=2g \
  --memory-swap=2g \
  -p 127.0.0.1:4125:4125 \
  -e LOAD_TEST_PLAYERS=4000 \
  tibia-performance-1x:final
```

Run the external two-minute generator:

```bash
LOAD_TEST_URL=ws://127.0.0.1:4125 \
LOAD_TEST_PLAYERS=4000 \
LOAD_TEST_STAGES=4000 \
LOAD_TEST_ACTIVITY_SECONDS=120 \
LOAD_TEST_ACTIVE_PERCENT=100 \
LOAD_TEST_ACTIONS_PER_ACTIVE_PLAYER_SECOND=2 \
LOAD_TEST_MAX_P95_MS=500 \
yarn workspace server playtest:players
```

Run the constrained monster server by overriding the image command, then run
the external scenario:

```bash
docker run --name tibia-monster-capacity \
  --cpus=1 \
  --memory=2g \
  --memory-swap=2g \
  -p 127.0.0.1:4125:4125 \
  tibia-performance-1x:final \
  node --import tsx server/src/playtest/monsterLoadServer.ts

LOAD_TEST_URL=ws://127.0.0.1:4125 \
yarn workspace server playtest:monster-capacity
```

Build the no-GPU client image and create an isolated test network:

```bash
docker build -f Dockerfile.client-performance \
  -t tibia-client-performance:software .

docker network create tibia-client-test

docker run --name tibia-client-test-server \
  --network tibia-client-test \
  --add-host=host.docker.internal:host-gateway \
  -e PLAYTEST_ADMIN_URL=postgres://tibia:tibia_dev_only@host.docker.internal:5432/postgres \
  -e PLAYTEST_PORT=4124 \
  -e PLAYTEST_DATABASE=playtest_e2e \
  tibia-client-performance:software \
  node --import tsx server/src/playtest/e2eServer.ts
```

In another shell, cap only the browser/test process:

```bash
docker run --rm \
  --network tibia-client-test \
  --cpus=2 \
  --memory=4g \
  --memory-swap=4g \
  --shm-size=1g \
  -e PLAYTEST_EXTERNAL_SERVER=1 \
  -e VITE_PLAYTEST_WS_URL=ws://tibia-client-test-server:4124 \
  tibia-client-performance:software
```

The CPU-only browser test logs every stage even when it fails the FPS gate.

Regression commands:

```bash
yarn typecheck
yarn test:tools
yarn workspace client test
yarn workspace server test
yarn workspace server test:integration
yarn test:monsters:cpu
yarn test:monsters:gpu
```

Final validated regression counts were 54 tool tests, 195 client unit tests,
676 server unit tests, and 170 PostgreSQL integration tests. The software
browser E2E passed on the unconstrained host. The native hardware GPU gate
cannot pass in the current WSL graphics environment because Chromium does not
receive the RTX adapter.

## Work still required before raising production above 2,000

1. Deploy the exact image to `performance-1x` and generate load from other Fly
   Machines through TLS/Fly Proxy.
2. Test real Supabase authentication and staging PostgreSQL, including 4,000
   dirty saves, pool exhaustion, timeouts and a database outage.
3. Run at least 30 minutes of mixed movement, combat, spells, runes, loot,
   containers, chat, economy, deaths, relogs and reconnect storms.
4. Add combined players-plus-monsters, hostile pathfinding, dense
   100/300/500-player hotspots, and one deliberately slow client cohort.
5. Measure outbound bytes, Fly egress cost, CPU throttling, tick overruns, GC,
   heap, socket buffer, intent depth, AI budget depth, pool wait, queries,
   transactions, locks, WAL and IOPS.
6. Add statement/lock/transaction timeouts where each store can safely handle
   them and bound authentication/database admission during reconnect storms.
7. Run a native integrated-GPU low-end client and a native RTX 4090 browser
   benchmark.
8. Keep 30-50% measured production headroom and separate the advertised
   in-world limit from bounded connection/reconnect/operator headroom.

Until those gates pass, **4,000 is a controlled runtime estimate, 2,000 is the
safe configured production admission limit, and neither is a promise about a
specific public deployment.**
