import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { clusterSpawnGroups } from "./clusterSpawnGroups.mjs";
import { findWalkPath } from "./findWalkPath.mjs";
import { orderHuntRing } from "./orderHuntRing.mjs";
import { readMapGeometry } from "./readMapGeometry.mjs";

/**
 * Generates Hunt Finder entries for spawn populations the hand-written
 * catalog does not cover yet.
 *
 * The world map already knows where every hunting spot is: `world-spawns.json`
 * says which creatures stand where, and `otservbr.map.bin` says which tiles a
 * character can walk. Clustering the first against the second turns "Darashia
 * has one rotworm entry but six rotworm caves" into six entries with real
 * patrol rings, each leg proven walkable under the same budget the hunting
 * bot spends at runtime.
 *
 * Generated entries carry `"Generated": true`. Hand-written entries always
 * win: a rerun replaces only what it made last time.
 *
 * Usage: node tools/buildHuntingPlaces.mjs [--dry-run] [--out <path>]
 */

const repoRoot = resolve(import.meta.dirname, "..");
const catalogPath = join(
  repoRoot,
  "client/public/assets/hunting/hunting_places.json",
);

/**
 * What to generate. One target is one creature theme in one region; every
 * distinct cave of that theme becomes its own hunt. Kept explicit rather than
 * swept world-wide so each batch can be walked in-game before the next.
 */
const TARGETS = [
  {
    location: "Darashia",
    town: "Darashia",
    typeIds: ["rotworm", "carrion-worm"],
    area: { minX: 32950, maxX: 33420, minY: 32180, maxY: 32620 },
    name: "Darashia Rotworm Cave",
  },
];

const RING = {
  /** Anchors closer than this to an accepted one are dropped as redundant. */
  minAnchorSpacing: 6,
  /** Patrol anchors one floor's ring may hold before it stops adding stops. */
  maxAnchorsPerFloor: 30,
  /** Waypoints one floor's ring may hold, well under the protocol's 200. */
  maxWaypointsPerFloor: 60,
  /** A floor needs this many spawns of its own to be worth patrolling. */
  minSpawnsPerFloor: 6,
  /** Mirrors HUNTING_BOT_LIMITS.pathSearchMargin. */
  pathSearchMargin: 40,
  /** Mirrors HUNTING_BOT_LIMITS.maxRuntimeVisited. */
  maxRuntimeVisited: 4_000,
  /** Budget for the generator's own, deliberately generous, path searches. */
  maxBuildVisited: 60_000,
  /** How far a spawn home may be from the walkable tile that stands in for it. */
  maxSnapDistance: 4,
};

/** How far a hand-written route may sit from a cave and still own it. */
const COVERAGE_MARGIN = 25;

/** How far from a waypoint a spawn still counts as part of the hunt. */
const POPULATION_RADIUS = 12;

const EMPTY_RING = { waypoints: [], cavern: new Set() };

const dryRun = process.argv.includes("--dry-run");
const outIndex = process.argv.indexOf("--out");
const outPath = outIndex === -1 ? catalogPath : process.argv[outIndex + 1];

const map = readMapGeometry(join(repoRoot, "server/data"), "otservbr");
const spawns = readJson("content/spawns/world-spawns.json");
const monsters = readJson("content/monsters/world-monsters.json");
const itemCatalog = readJson("server/data/item-catalog.json");
const catalog = readJson("client/public/assets/hunting/hunting_places.json");

const monsterById = new Map(monsters.types.map((type) => [type.id, type]));
const itemsByName = new Map();
for (const item of Object.values(itemCatalog.items).sort(
  (left, right) => left.id - right.id,
)) {
  const name = item.name.trim().toLowerCase();
  if (!itemsByName.has(name)) itemsByName.set(name, item);
}
const itemsById = new Map(
  Object.values(itemCatalog.items).map((item) => [item.id, item]),
);

const catalogText = readFileSync(catalogPath, "utf8");
const entrySpans = topLevelSpans(catalogText);
const curated = catalog.filter((place) => place.Generated !== true);
const enabledSlots = spawns.slots.filter(
  (slot) => slot.kind === "monster" && slot.enabled,
);

const levelCurve = fitLevelCurve();

const generated = [];
const report = [];
for (const target of TARGETS) {
  const targeted = enabledSlots.filter(
    (slot) =>
      target.typeIds.includes(slot.typeId) && inArea(slot.home, target.area),
  );
  const groups = clusterSpawnGroups(targeted);
  for (const group of groups) {
    const covered = curatedCovering(group, target.typeIds);
    if (covered) {
      report.push(
        `skip ${describe(group)} — already covered by "${covered.Name}"`,
      );
      continue;
    }
    const place = buildPlace(group, target);
    if (!place) {
      report.push(`skip ${describe(group)} — no walkable ring, or no way in`);
      continue;
    }
    generated.push(place);
    report.push(
      `add  "${place.Name}" — ${group.slots.length} spawns, ${
        Object.entries(place.RoutePath.Coordinates)
          .map(([floor, segments]) => `floor ${floor}: ${segments.length} legs`)
          .join(", ")
      }`,
    );
  }
}

const named = new Set(curated.map((place) => place.Name));
for (const place of generated) {
  let name = place.Name;
  let suffix = 2;
  while (named.has(name)) name = `${place.Name} ${suffix++}`;
  place.Name = name;
  named.add(name);
}

const merged = [...curated, ...generated];
for (const line of report) console.log(line);
console.log(
  `hunting places: ${curated.length} curated + ${generated.length} generated`,
);
if (!dryRun) {
  writeFileSync(outPath, renderCatalog());
  console.log(`written: ${outPath}`);
}

/**
 * The hand-written entries are copied out of the file byte for byte and the
 * generated ones appended after them, so a rerun diffs as the hunts it
 * changed rather than as a reformat of a thousand curated lines.
 */
function renderCatalog() {
  const kept = entrySpans
    .filter((_, index) => catalog[index]?.Generated !== true)
    .map((span) => catalogText.slice(span.start, span.end));
  const added = generated.map((place) =>
    JSON.stringify(place, null, 4)
      .split("\n")
      .map((line, index) => (index === 0 ? line : `    ${line}`))
      .join("\n"),
  );
  return `[\n    ${[...kept, ...added].join(",\n    ")}\n]`;
}

/** Byte spans of the array's top-level entries, quotes and escapes respected. */
function topLevelSpans(text) {
  const spans = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{" || character === "[") {
      if (depth === 1) start = index;
      depth += 1;
    } else if (character === "}" || character === "]") {
      depth -= 1;
      if (depth === 1 && start >= 0) {
        spans.push({ start, end: index + 1 });
        start = -1;
      }
    }
  }
  return spans;
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
}

function inArea(position, area) {
  return (
    position.x >= area.minX &&
    position.x <= area.maxX &&
    position.y >= area.minY &&
    position.y <= area.maxY
  );
}

function describe(group) {
  return `cluster @ ${Math.round((group.box.minX + group.box.maxX) / 2)},${Math.round(
    (group.box.minY + group.box.maxY) / 2,
  )},${group.box.z} (${group.slots.length} spawns)`;
}

/**
 * A hand-written hunt for these same creatures whose route already runs
 * through this cave. Matching on geometry alone is not enough — a minotaur
 * route two floors above a worm cave shares coordinates without sharing a
 * hunt — so the creatures have to line up as well.
 */
function curatedCovering(group, typeIds) {
  const targeted = new Set(
    typeIds.flatMap((typeId) => {
      const type = monsterById.get(typeId);
      return type ? [type.name.toLowerCase()] : [];
    }),
  );
  return curated.find(
    (place) =>
      place.Monsters.some((monster) =>
        targeted.has(monster.Name.toLowerCase()),
      ) &&
      routePositions(place).some(
        (position) =>
          position.z >= group.box.minZ - 1 &&
          position.z <= group.box.maxZ + 1 &&
          position.x >= group.box.minX - COVERAGE_MARGIN &&
          position.x <= group.box.maxX + COVERAGE_MARGIN &&
          position.y >= group.box.minY - COVERAGE_MARGIN &&
          position.y <= group.box.maxY + COVERAGE_MARGIN,
      ),
  );
}

function routePositions(place) {
  return Object.values(place.RoutePath?.Coordinates ?? {}).flatMap((segments) =>
    segments.flat(),
  );
}

function buildPlace(group, target) {
  const floors = [...new Set(group.slots.map((slot) => slot.home.z))].sort(
    (left, right) => left - right,
  );
  const coordinates = {};
  const caverns = new Map();
  for (const floor of floors) {
    const onFloor = group.slots.filter((slot) => slot.home.z === floor);
    if (onFloor.length < RING.minSpawnsPerFloor) continue;
    const { waypoints, cavern } = buildRing(onFloor, group.box);
    if (waypoints.length < 3) continue;
    coordinates[String(floor)] = toSegments(waypoints);
    caverns.set(floor, cavern);
  }
  if (Object.keys(coordinates).length === 0) return null;

  const population = populationOf(coordinates, caverns);
  const profile = bestProfile(population);
  const town = map.towns.find(
    (candidate) => candidate.name.toLowerCase() === target.town.toLowerCase(),
  );
  const entrance = firstWaypoint(coordinates);
  const approach = traceApproach(entrance, town);
  if (!reachableFromApproach(approach, entrance)) return null;

  return {
    Name: `${target.name} ${compassOf(group.box, town)}`.trim(),
    Level: recommendedLevel(population, profile),
    Type: profile.Type,
    "Xp/Hour": profile["Xp/Hour"],
    "Loot/Hour": profile["Loot/Hour"],
    Location: target.location,
    Vocation: profile.Vocation,
    PremiumRequired: profile.PremiumRequired,
    Generated: true,
    RouteRequirements: profile.RouteRequirements,
    RecommendedImbues: profile.RecommendedImbues,
    RecommendedSupplies: profile.RecommendedSupplies,
    ValuableDrops: valuableDrops(population),
    Monsters: population.map(({ type }) => ({
      Name: type.name,
      Resistances: resistancesOf(type),
    })),
    WayPath: approach,
    RoutePath: { Coordinates: coordinates, Paths: [] },
    Equipments: profile.Equipments,
  };
}

/**
 * Every creature the patrol actually meets, commonest first: spawns sharing
 * the walked cavern and standing within sight of one of its waypoints. Taking
 * the cave's bounding box instead would drag in whatever lives behind its
 * walls or on the floor below, and the inherited difficulty profile would
 * follow.
 */
function populationOf(coordinates, caverns) {
  const waypointsByFloor = new Map();
  for (const [floor, segments] of Object.entries(coordinates)) {
    waypointsByFloor.set(
      Number(floor),
      segments.map(([start]) => start),
    );
  }
  const counts = new Map();
  for (const slot of enabledSlots) {
    const waypoints = waypointsByFloor.get(slot.home.z);
    if (!waypoints) continue;
    // Standing near a waypoint is not enough — a rock wall is one tile thick,
    // and the cave next door must not raise this hunt's difficulty. The spawn
    // has to sit in the same cavern the route walks.
    const tile = snapToWalkable(slot.home);
    if (!tile || !caverns.get(slot.home.z)?.has(`${tile.x},${tile.y}`)) continue;
    const met = waypoints.some(
      (waypoint) => chebyshev(waypoint, slot.home) <= POPULATION_RADIUS,
    );
    if (!met) continue;
    counts.set(slot.typeId, (counts.get(slot.typeId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .flatMap(([typeId, count]) => {
      const type = monsterById.get(typeId);
      return type ? [{ type, count }] : [];
    })
    .sort(
      (left, right) =>
        right.count - left.count || left.type.name.localeCompare(right.type.name),
    )
    .slice(0, 8);
}

/**
 * The hand-written hunt that fights the same creatures, whose difficulty and
 * gear advice therefore apply here too. Level and xp/hour are playtested
 * judgements no map file holds, so they are inherited rather than invented.
 */
function bestProfile(population) {
  const wanted = new Set(population.map(({ type }) => type.name.toLowerCase()));
  let best = null;
  let bestScore = 0;
  for (const place of curated) {
    const names = new Set(
      place.Monsters.map((monster) => monster.Name.toLowerCase()),
    );
    const shared = [...names].filter((name) => wanted.has(name)).length;
    if (shared === 0) continue;
    const score = shared / (names.size + wanted.size - shared);
    if (score > bestScore) {
      bestScore = score;
      best = place;
    }
  }
  if (!best) {
    throw new Error(
      `no curated hunt shares creatures with ${[...wanted].join(", ")}`,
    );
  }
  return best;
}

/**
 * The level to send a character in at: the matched hunt's own level, unless
 * something in this cave is far out of that hunt's league. A shared wall can
 * put a creature worth a hundred times the xp on the same patrol, and
 * inheriting "level 8" there would be an invitation to die.
 */
function recommendedLevel(population, profile) {
  const strongest = Math.max(
    ...population.map(({ type }) => type.experience ?? 0),
    1,
  );
  const derived = levelCurve.a * strongest ** levelCurve.b;
  const inherited = Number(profile.Level);
  if (!Number.isFinite(inherited) || derived <= inherited * 1.5) {
    return profile.Level;
  }
  return String(derived < 100 ? Math.round(derived / 5) * 5 : Math.round(derived / 25) * 25);
}

/**
 * Recommended level against strongest-creature experience, fitted in log-log
 * space over the hand-written catalog, so the estimate re-calibrates as that
 * catalog grows rather than hard-coding today's numbers.
 */
function fitLevelCurve() {
  const samples = curated.flatMap((place) => {
    const experience = place.Monsters.flatMap((monster) => {
      const type = monsters.types.find(
        (candidate) => candidate.name.toLowerCase() === monster.Name.toLowerCase(),
      );
      return type ? [type.experience ?? 0] : [];
    });
    const level = Number(place.Level);
    if (experience.length === 0 || !Number.isFinite(level) || level <= 0) return [];
    return [{ x: Math.log(Math.max(...experience, 1)), y: Math.log(level) }];
  });
  const meanX = samples.reduce((sum, s) => sum + s.x, 0) / samples.length;
  const meanY = samples.reduce((sum, s) => sum + s.y, 0) / samples.length;
  const b =
    samples.reduce((sum, s) => sum + (s.x - meanX) * (s.y - meanY), 0) /
    samples.reduce((sum, s) => sum + (s.x - meanX) ** 2, 0);
  return { a: Math.exp(meanY - b * meanX), b };
}

function resistancesOf(type) {
  const elements = type.elements ?? {};
  const percent = (key) => `${100 - (elements[key] ?? 0)}%`;
  return [
    `Fire: ${percent("COMBAT_FIREDAMAGE")}`,
    `Ice: ${percent("COMBAT_ICEDAMAGE")}`,
    `Earth: ${percent("COMBAT_EARTHDAMAGE")}`,
    `Energy: ${percent("COMBAT_ENERGYDAMAGE")}`,
    `Holy: ${percent("COMBAT_HOLYDAMAGE")}`,
    `Death: ${percent("COMBAT_DEATHDAMAGE")}`,
    `Physical: ${percent("COMBAT_PHYSICALDAMAGE")}`,
  ].join(", ");
}

function valuableDrops(population) {
  const worthByName = new Map();
  for (const { type } of population) {
    for (const entry of type.loot ?? []) {
      const item =
        (entry.id === undefined ? undefined : itemsById.get(entry.id)) ??
        (entry.name === undefined
          ? undefined
          : itemsByName.get(entry.name.trim().toLowerCase()));
      if (!item?.pickupable) continue;
      const worth = item.worth ?? item.npcValue ?? 0;
      const name = titleCase(item.name);
      worthByName.set(name, Math.max(worthByName.get(name) ?? 0, worth));
    }
  }
  return [...worthByName.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));
}

function titleCase(name) {
  return name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function buildRing(slots, box) {
  const bounds = {
    minX: box.minX - RING.pathSearchMargin,
    maxX: box.maxX + RING.pathSearchMargin,
    minY: box.minY - RING.pathSearchMargin,
    maxY: box.maxY + RING.pathSearchMargin,
  };
  const anchors = [];
  for (const slot of slots) {
    const anchor = snapToWalkable(slot.home);
    if (!anchor) continue;
    if (anchors.some((existing) => chebyshev(existing, anchor) === 0)) continue;
    anchors.push(anchor);
  }
  if (anchors.length < 3) return EMPTY_RING;

  const cavern = largestCavern(anchors, bounds);
  const spaced = [];
  for (const anchor of cavern.anchors) {
    if (
      spaced.every(
        (existing) => chebyshev(existing, anchor) >= RING.minAnchorSpacing,
      )
    ) {
      spaced.push(anchor);
    }
  }
  if (spaced.length < 3) return EMPTY_RING;

  const cache = new Map();
  const walk = (from, to) => {
    const cacheKey = `${from.x},${from.y}|${to.x},${to.y}|${from.z}`;
    const hit = cache.get(cacheKey);
    if (hit !== undefined) return hit;
    const { path } = findWalkPath({
      map,
      start: from,
      goal: to,
      bounds,
      maxVisited: RING.maxBuildVisited,
    });
    cache.set(cacheKey, path);
    return path;
  };
  const distance = (from, to) => walk(from, to)?.length ?? Infinity;

  const tour = orderHuntRing(
    spaced.slice(0, RING.maxAnchorsPerFloor),
    distance,
  ).filter((anchor, index, all) => {
    const next = all[(index + 1) % all.length];
    return index === 0 || distance(anchor, next) !== Infinity;
  });
  if (tour.length < 3) return EMPTY_RING;

  // Every hop the bot makes must be solvable inside its runtime budget, so
  // split any leg that is not into pieces cut from the walk we already have.
  const waypoints = [];
  for (const [index, anchor] of tour.entries()) {
    waypoints.push(anchor);
    const next = tour[(index + 1) % tour.length];
    for (const extra of legFillers(anchor, next, walk)) waypoints.push(extra);
  }
  // Truncating a ring would leave its closing leg unproven, so an oversized
  // one is dropped whole instead.
  if (waypoints.length > RING.maxWaypointsPerFloor) return EMPTY_RING;
  return { waypoints, cavern: cavern.tiles };
}

function legFillers(from, to, walk) {
  if (solvableAtRuntime(from, to)) return [];
  const path = walk(from, to);
  if (!path) return [];
  const fillers = [];
  let anchor = from;
  for (const step of path) {
    if (chebyshev(anchor, step) < 10) continue;
    if (!solvableAtRuntime(anchor, step)) continue;
    fillers.push(step);
    anchor = step;
  }
  return solvableAtRuntime(anchor, to) ? fillers : [];
}

function solvableAtRuntime(from, to) {
  const { path } = findWalkPath({
    map,
    start: from,
    goal: to,
    bounds: {
      minX: Math.min(from.x, to.x) - RING.pathSearchMargin,
      maxX: Math.max(from.x, to.x) + RING.pathSearchMargin,
      minY: Math.min(from.y, to.y) - RING.pathSearchMargin,
      maxY: Math.max(from.y, to.y) + RING.pathSearchMargin,
    },
    maxVisited: RING.maxRuntimeVisited,
  });
  return path !== null;
}

function snapToWalkable(home) {
  for (let radius = 0; radius <= RING.maxSnapDistance; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const candidate = { x: home.x + dx, y: home.y + dy, z: home.z };
        if (map.isWalkable(candidate) && map.getGroundSpeed(candidate)) {
          return candidate;
        }
      }
    }
  }
  return null;
}

/** The biggest walkable cavern the anchors share, flood-filled on their floor. */
function largestCavern(anchors, bounds) {
  const seen = new Map();
  const components = [];
  for (const anchor of anchors) {
    const anchorKey = `${anchor.x},${anchor.y}`;
    if (seen.has(anchorKey)) continue;
    const id = components.length;
    const queue = [anchor];
    seen.set(anchorKey, id);
    let cursor = 0;
    while (cursor < queue.length) {
      const current = queue[cursor++];
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        const next = { x: current.x + dx, y: current.y + dy, z: anchor.z };
        if (
          next.x < bounds.minX ||
          next.x > bounds.maxX ||
          next.y < bounds.minY ||
          next.y > bounds.maxY
        ) {
          continue;
        }
        const nextKey = `${next.x},${next.y}`;
        if (seen.has(nextKey)) continue;
        if (!map.isWalkable(next) || !map.getGroundSpeed(next)) continue;
        seen.set(nextKey, id);
        queue.push(next);
      }
    }
    components.push(id);
  }
  const byCavern = new Map();
  for (const anchor of anchors) {
    const id = seen.get(`${anchor.x},${anchor.y}`);
    if (id === undefined) continue;
    const bucket = byCavern.get(id) ?? [];
    bucket.push(anchor);
    byCavern.set(id, bucket);
  }
  const [largest] = [...byCavern.entries()].sort(
    (left, right) => right[1].length - left[1].length,
  );
  if (!largest) return { anchors: [], tiles: new Set() };
  const tiles = new Set();
  for (const [tile, id] of seen) if (id === largest[0]) tiles.add(tile);
  return { anchors: largest[1], tiles };
}

function toSegments(waypoints) {
  return waypoints.map((waypoint, index) => [
    waypoint,
    waypoints[(index + 1) % waypoints.length],
  ]);
}

function firstWaypoint(coordinates) {
  const floors = Object.keys(coordinates).map(Number).sort((a, b) => a - b);
  return coordinates[String(floors[0])][0][0];
}

/**
 * How a character gets from the temple down to the cave: the chain of
 * ladders, holes and ropes that ends inside the ring, walked backwards to the
 * surface. Only the access points are known geometry, so the drawn lines
 * between them are straight, exactly as the hand-written entries draw them.
 */
function traceApproach(entrance, town) {
  const descents = [];
  let arrival = entrance;
  for (let hop = 0; hop < 6 && arrival.z > 7; hop += 1) {
    const link = nearestDescentTo(arrival);
    if (!link) break;
    descents.push(link);
    arrival = link.source;
  }
  descents.reverse();

  const coordinates = {};
  const push = (from, to) => {
    const floor = String(from.z);
    coordinates[floor] = [...(coordinates[floor] ?? []), [from, to]];
  };
  const templePosition =
    town === undefined
      ? undefined
      : { x: town.x, y: town.y, z: town.z };
  let cursor = templePosition;
  for (const link of descents) {
    // The walk from the temple crosses stairs this trace knows nothing about,
    // so the first leg is drawn as the straight line the hand-written entries
    // draw: temple to the way down, on the floor the way down is on.
    if (cursor) {
      push({ x: cursor.x, y: cursor.y, z: link.source.z }, link.source);
    }
    cursor = link.destination;
  }
  if (cursor && cursor.z === entrance.z && cursor !== entrance) {
    push(cursor, entrance);
  }

  const steps = descents.map(
    (link) =>
      `${accessVerb(link.kind)} at ${link.source.x}, ${link.source.y} to floor ${floorLabel(link.destination.z).trim()}`,
  );
  return {
    Coordinates: coordinates,
    Markers: [],
    Paths:
      steps.length > 0
        ? [`From ${town?.name ?? "the nearest temple"}: ${steps.join("; ")}.`]
        : [],
    Position: entrance,
    ...(templePosition ? { TemplePosition: templePosition } : {}),
  };
}

/**
 * Whether the way down this trace found actually opens into the cave the
 * route walks. Landing one wall away from the ring is easy to do — the hole
 * above a cavern often drops into the corridor next door — and a hunt nobody
 * can enter is worse than no hunt at all.
 */
function reachableFromApproach(approach, entrance) {
  const segments = approach.Coordinates[String(entrance.z)] ?? [];
  const arrival = segments.at(-1)?.[0];
  if (!arrival) return false;
  const { path } = findWalkPath({
    map,
    start: arrival,
    goal: entrance,
    bounds: {
      minX: Math.min(arrival.x, entrance.x) - RING.pathSearchMargin,
      maxX: Math.max(arrival.x, entrance.x) + RING.pathSearchMargin,
      minY: Math.min(arrival.y, entrance.y) - RING.pathSearchMargin,
      maxY: Math.max(arrival.y, entrance.y) + RING.pathSearchMargin,
    },
    maxVisited: RING.maxBuildVisited,
  });
  return path !== null;
}

function accessVerb(kind) {
  if (kind === "ladder") return "take the ladder down";
  if (kind === "dropdown") return "climb down";
  if (kind === "rope-spot") return "use a rope";
  if (kind === "hole") return "go down the hole";
  return "go down";
}

/** The closest way down that lands within reach of `arrival`. */
function nearestDescentTo(arrival) {
  const links = [
    ...map.transitions.filter((transition) => transition.kind !== "teleport"),
    ...map.actions,
  ].filter(
    (link) =>
      link.destination.z === arrival.z &&
      link.source.z < link.destination.z &&
      Math.abs(link.destination.x - arrival.x) <= 60 &&
      Math.abs(link.destination.y - arrival.y) <= 60,
  );
  let best = null;
  let bestDistance = Infinity;
  for (const link of links) {
    const distance = chebyshev(link.destination, arrival);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = link;
    }
  }
  return best;
}

function compassOf(box, town) {
  if (!town) return "";
  const dx = (box.minX + box.maxX) / 2 - town.x;
  const dy = (box.minY + box.maxY) / 2 - town.y;
  const vertical = Math.abs(dy) < 25 ? "" : dy < 0 ? "North" : "South";
  const horizontal = Math.abs(dx) < 25 ? "" : dx < 0 ? "West" : "East";
  const compass = `${vertical}${horizontal}`;
  return compass === "" ? "Central " : `${compass} `;
}

function floorLabel(floor) {
  return floor === 7 ? "" : `-${floor - 7}`;
}

function chebyshev(first, second) {
  return Math.max(Math.abs(first.x - second.x), Math.abs(first.y - second.y));
}
