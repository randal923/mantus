import { createHash } from "node:crypto";
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

/** The floor a character walks the world on; below it is underground. */
const SURFACE_FLOOR = 7;

/**
 * Towns no hunt is run from: the tutorial islands, whose temples sit close
 * enough to real ground to steal its name.
 */
const NON_HUNTING_TOWNS = new Set(["dawnport tutorial", "island of destiny"]);

/** Why the last `buildPlace` gave up, for a report a human reads. */
let lastSkipReason = "";

/**
 * Every route tile in the catalog, bucketed so a cave can ask "is this ground
 * already hunted?" without walking hundreds of routes. It grows as the run
 * adds caves, which is what lets a world sweep run after a hand-listed batch
 * without generating the same cave twice.
 */
const ROUTE_CELL = 32;
const routeIndex = new Map();

/** Entry fields written on one line: routes are thousands of coordinates. */
const DENSE_KEYS = new Set(["RoutePath", "WayPath", "Spots"]);

/** How far a hand-written route may sit from a cave and still own it. */
const COVERAGE_MARGIN = 25;

/** How far from a waypoint a spawn still counts as part of the hunt. */
const POPULATION_RADIUS = 12;

const EMPTY_RING = { waypoints: [], cavern: new Set() };

const LIMITS = {
  /** Spawns a cave needs before it is worth walking. */
  minSpawns: 20,
  /** Caves one hunt may gather, biggest first. */
  cavesPerHunt: 6,
  /** Creatures worth no more than this are scenery, not a hunt. */
  minExperience: 15,
};

const world = process.argv.includes("--world");
const limitIndex = process.argv.indexOf("--limit");
/** Caves to process, for a quick smoke run over a world sweep. */
const limit =
  limitIndex === -1 ? Infinity : Number(process.argv[limitIndex + 1] ?? 0);
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

// Spots are generated data living on a hand-written entry, so a rerun starts
// from the entry as its author left it and re-attaches what it finds today.
const edited = new Set();
for (const [index, place] of catalog.entries()) {
  if (place.Generated === true) continue;
  if (place.Spots === undefined && place.SpotName === undefined) continue;
  delete place.Spots;
  delete place.SpotName;
  edited.add(index);
}

const levelCurve = fitLevelCurve();

for (const place of curated) indexPlace(place);

const generated = [];
// Only the hand-written names are reserved: last run's generated hunts are
// being rebuilt, so their names are free again and stay stable across runs.
const takenNames = new Set(curated.map((place) => place.Name));
const report = [];
for (const batch of world
  ? [...batchesFromTargets(), ...sweepWorld()]
  : batchesFromTargets()) {
  const built = [];
  const owners = new Map();
  for (const group of batch.groups) {
    const covered = curatedCovering(group, creatureIdsOf(group));
    if (covered) {
      owners.set(covered, (owners.get(covered) ?? 0) + 1);
      report.push(
        `skip ${describe(group)} — already covered by "${covered.Name}"`,
      );
      continue;
    }
    const place = buildPlace(group, batch.target);
    if (!place) {
      report.push(`skip ${describe(group)} — ${lastSkipReason}`);
      continue;
    }
    built.push({ place, group });
  }
  if (built.length === 0) continue;

  // One city's rotworm caves are one hunt with several ways in, not several
  // hunts: the creatures, the gear and the drops are the same, so they gather
  // onto the hand-written entry that already describes them when there is one.
  const [owner] = [...owners.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0] ?? [];
  // The biggest caves first, then trimmed: a picker with forty pins on it is
  // not a choice, and the small ones are the poor hunts anyway.
  built.sort((left, right) => right.group.slots.length - left.group.slots.length);
  const kept = built;
  const host = owner ?? kept[0].place;
  if (!owner) {
    // Named after the creature actually met on the route, not the one that
    // dominated the raw cluster: the two disagree when a cluster spans two
    // caverns, and a hunt must not advertise a creature it does not hold.
    const lead = host.Monsters[0]?.Name ?? batch.target.name;
    host.Name = uniqueName(
      `${batch.target.town || "Wild"} ${lead} Caves`,
      takenNames,
    );
  }
  const rest = owner ? kept : kept.slice(1);
  const town = map.towns.find(
    (candidate) =>
      candidate.name.toLowerCase() === batch.target.town.toLowerCase(),
  );
  const existing = host.Spots ?? [];
  const room = Math.max(0, LIMITS.cavesPerHunt - 1 - existing.length);
  const additions = rest.slice(0, room);
  const named = nameSpots(
    [
      { place: host, box: routeBox(host) },
      ...additions.map(({ place, group }) => ({ place, box: group.box })),
    ],
    town,
  );
  // A hunt can be reached by more than one pass — a hand-listed batch and
  // then the world sweep — so caves are added to the ones it already has
  // rather than replacing them.
  const takenSpotNames = new Set([
    host.SpotName ?? named[0],
    ...existing.map((spot) => spot.Name),
  ]);
  host.SpotName ??= named[0];
  host.Spots = [
    ...existing,
    ...additions.map(({ place }, index) => ({
      Name: uniqueName(named[index + 1], takenSpotNames),
      Generated: true,
      Position: place.SpotPosition,
      WayPath: place.WayPath,
      RoutePath: place.RoutePath,
    })),
  ];
  // The hand-written host describes its own cave but never says where it is
  // entered from the surface, so the same trace answers for it too.
  host.SpotPosition ??= surfaceEntranceOf(host, town);
  for (const spot of host.Spots) indexRoute(host, spot.RoutePath);
  if (owner) {
    edited.add(catalog.indexOf(owner));
    report.push(
      `gather ${host.Spots.length} caves onto "${host.Name}" as ${host.Spots
        .map((spot) => spot.Name)
        .join(", ")}`,
    );
  } else {
    indexRoute(host, host.RoutePath);
    generated.push(host);
    report.push(
      `add "${host.Name}" with ${host.Spots.length + 1} caves`,
    );
  }
}

/** A catalog name no other hunt has taken. */
function uniqueName(name, taken) {
  let candidate = name;
  for (let suffix = 2; taken.has(candidate); suffix += 1) {
    candidate = `${name} ${suffix}`;
  }
  taken.add(candidate);
  return candidate;
}

/** One batch per hand-listed target: its creatures inside its region. */
function batchesFromTargets() {
  return TARGETS.map((target) => ({
    target,
    groups: clusterSpawnGroups(
      enabledSlots.filter(
        (slot) =>
          target.typeIds.includes(slot.typeId) && inArea(slot.home, target.area),
      ),
    ),
  }));
}

/**
 * Every huntable population on the map, gathered into hunts.
 *
 * A cluster is a cave; caves are grouped by the town they are hunted from and
 * the creature that dominates them, which is how a player names a hunt —
 * "the rotworm caves out of Darashia" — rather than by which cluster the
 * union-find happened to produce.
 */
function sweepWorld() {
  const huntable = enabledSlots.filter((slot) => {
    const type = monsterById.get(slot.typeId);
    return (
      type?.flags?.hostile === true && (type.experience ?? 0) >= LIMITS.minExperience
    );
  });
  const groups = clusterSpawnGroups(huntable, { minSize: LIMITS.minSpawns });
  const batches = new Map();
  for (const group of groups.slice(0, limit)) {
    const town = nearestTown(group.box);
    const creature = dominantCreature(group);
    if (!creature) continue;
    const key = `${town?.name ?? "wilds"}|${creature.id}`;
    const batch = batches.get(key) ?? {
      target: {
        location: town?.name ?? "The Wilds",
        town: town?.name ?? "",
        name: `${town?.name ?? "Wild"} ${creature.name} Caves`,
      },
      groups: [],
    };
    batch.groups.push(group);
    batches.set(key, batch);
  }
  return [...batches.values()];
}

function creatureIdsOf(group) {
  return [...new Set(group.slots.map((slot) => slot.typeId))];
}

function dominantCreature(group) {
  const counts = new Map();
  for (const slot of group.slots) {
    counts.set(slot.typeId, (counts.get(slot.typeId) ?? 0) + 1);
  }
  const [typeId] = [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )[0] ?? [];
  return typeId ? monsterById.get(typeId) : undefined;
}

/** The town a hunt is run from: the closest temple, floors ignored. */
function nearestTown(box) {
  const x = (box.minX + box.maxX) / 2;
  const y = (box.minY + box.maxY) / 2;
  let best;
  let bestDistance = Infinity;
  for (const town of map.towns) {
    if (NON_HUNTING_TOWNS.has(town.name.toLowerCase())) continue;
    const distance = Math.max(Math.abs(town.x - x), Math.abs(town.y - y));
    if (distance >= bestDistance) continue;
    bestDistance = distance;
    best = town;
  }
  return best;
}

const merged = [...curated, ...generated];
for (const line of report) console.log(line);
const spotCount = merged.reduce(
  (total, place) => total + (place.Spots?.length ?? 0),
  0,
);
console.log(
  `hunting places: ${curated.length} curated + ${generated.length} generated, ` +
    `${spotCount} gathered caves, ${edited.size} hand-written hunts extended`,
);
if (!dryRun) {
  const rendered = renderCatalog();
  writeFileSync(outPath, rendered);
  console.log(`written: ${outPath}`);
  if (outPath === catalogPath) repinCatalogHash(rendered);
}

/**
 * `tools/importCanaryCreatures.mjs` refuses to run unless the catalog matches
 * the hash pinned in the source manifest — it is what keeps a hand edit from
 * silently desyncing the Hunt Finder's creatures from the world's spawns. A
 * generated edit has to move that pin with it.
 */
function repinCatalogHash(rendered) {
  const manifestPath = join(repoRoot, "content/source-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const source = manifest.sources?.huntingGroundSpawns;
  if (!source?.huntingPlacesSha256) {
    throw new Error("source manifest has no hunting-place hash to re-pin");
  }
  source.huntingPlacesSha256 = createHash("sha256")
    .update(rendered)
    .digest("hex");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`re-pinned huntingPlacesSha256: ${source.huntingPlacesSha256}`);
}

/**
 * The hand-written entries are copied out of the file byte for byte and the
 * generated ones appended after them, so a rerun diffs as the hunts it
 * changed rather than as a reformat of a thousand curated lines.
 */
function renderCatalog() {
  const kept = entrySpans.flatMap((span, index) => {
    const place = catalog[index];
    if (!place || place.Generated === true) return [];
    return [
      edited.has(index)
        ? indented(place)
        : catalogText.slice(span.start, span.end),
    ];
  });
  const added = generated.map((place) => indented(place));
  return `[\n    ${[...kept, ...added].join(",\n    ")}\n]`;
}

/**
 * One catalog entry as text: readable where a human reads it, dense where the
 * machine does. Routes are thousands of coordinates — pretty-printing them
 * costs megabytes in a file the client fetches whole — so they go on one
 * line each while the hunt's own fields keep the shape the hand-written
 * entries are in.
 */
function indented(place, indent = "    ") {
  const inner = `${indent}    `;
  const fields = Object.entries(place)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      const text = DENSE_KEYS.has(key)
        ? JSON.stringify(value)
        : JSON.stringify(value, null, 4).split("\n").join(`\n${inner}`);
      return `${inner}${JSON.stringify(key)}: ${text}`;
    });
  return `{\n${fields.join(",\n")}\n${indent}}`;
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
  const cells = new Set();
  for (
    let x = group.box.minX - COVERAGE_MARGIN;
    x <= group.box.maxX + COVERAGE_MARGIN;
    x += ROUTE_CELL
  ) {
    for (
      let y = group.box.minY - COVERAGE_MARGIN;
      y <= group.box.maxY + COVERAGE_MARGIN;
      y += ROUTE_CELL
    ) {
      for (let z = group.box.minZ - 1; z <= group.box.maxZ + 1; z += 1) {
        cells.add(cellKey(x, y, z));
      }
    }
  }
  // The far corner of the query box needs its own cell.
  for (let z = group.box.minZ - 1; z <= group.box.maxZ + 1; z += 1) {
    cells.add(
      cellKey(
        group.box.maxX + COVERAGE_MARGIN,
        group.box.maxY + COVERAGE_MARGIN,
        z,
      ),
    );
  }
  for (const cell of cells) {
    for (const entry of routeIndex.get(cell) ?? []) {
      if (
        entry.position.z < group.box.minZ - 1 ||
        entry.position.z > group.box.maxZ + 1 ||
        entry.position.x < group.box.minX - COVERAGE_MARGIN ||
        entry.position.x > group.box.maxX + COVERAGE_MARGIN ||
        entry.position.y < group.box.minY - COVERAGE_MARGIN ||
        entry.position.y > group.box.maxY + COVERAGE_MARGIN
      ) {
        continue;
      }
      if (
        entry.place.Monsters.some((monster) =>
          targeted.has(monster.Name.toLowerCase()),
        )
      ) {
        return entry.place;
      }
    }
  }
  return undefined;
}

function cellKey(x, y, z) {
  return `${Math.floor(x / ROUTE_CELL)},${Math.floor(y / ROUTE_CELL)},${z}`;
}

function indexRoute(place, path) {
  for (const position of Object.values(path?.Coordinates ?? {}).flatMap(
    (segments) => segments.flat(),
  )) {
    const key = cellKey(position.x, position.y, position.z);
    const bucket = routeIndex.get(key) ?? [];
    bucket.push({ place, position });
    routeIndex.set(key, bucket);
  }
}

function indexPlace(place) {
  indexRoute(place, place.RoutePath);
  for (const spot of place.Spots ?? []) indexRoute(place, spot.RoutePath);
}

function routePositions(place) {
  return Object.values(place.RoutePath?.Coordinates ?? {}).flatMap((segments) =>
    segments.flat(),
  );
}

function buildPlace(group, target) {
  lastSkipReason = "no walkable ring";
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
  lastSkipReason = "no way in";

  const population = populationOf(coordinates, caverns);
  const profile = bestProfile(population);
  const town = map.towns.find(
    (candidate) => candidate.name.toLowerCase() === target.town.toLowerCase(),
  );
  const entrance = firstWaypoint(coordinates);
  const { wayPath, surface, descents } = traceApproach(entrance, town);
  // A traced way in has to open into the cave the route walks. When none was
  // traced at all — a hole this tool cannot follow, a teleport, a quest door —
  // the hunt still ships: its ring is proven walkable, and the pin falls back
  // to the ring itself rather than the hunt being dropped for want of an
  // entrance a player already knows.
  if (descents > 0 && !reachableFromApproach(wayPath, entrance)) return null;

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
    SpotPosition: surface,
    WayPath: wayPath,
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
  let byLevel = null;
  let bestLevelGap = Infinity;
  const target = derivedLevel(population);
  for (const place of curated) {
    const names = new Set(
      place.Monsters.map((monster) => monster.Name.toLowerCase()),
    );
    // Nothing in the catalog fights these creatures for some of the map, so
    // a hunt of the same difficulty lends its gear and supplies instead.
    const level = Number(place.Level);
    const gap = Number.isFinite(level) ? Math.abs(level - target) : Infinity;
    if (gap < bestLevelGap) {
      bestLevelGap = gap;
      byLevel = place;
    }
    const shared = [...names].filter((name) => wanted.has(name)).length;
    if (shared === 0) continue;
    const score = shared / (names.size + wanted.size - shared);
    if (score > bestScore) {
      bestScore = score;
      best = place;
    }
  }
  const chosen = best ?? byLevel;
  if (!chosen) {
    throw new Error(
      `no curated hunt to model ${[...wanted].join(", ")} on`,
    );
  }
  return chosen;
}

/** The level the fitted curve puts on this cave's strongest creature. */
function derivedLevel(population) {
  const strongest = Math.max(
    ...population.map(({ type }) => type.experience ?? 0),
    1,
  );
  return levelCurve.a * strongest ** levelCurve.b;
}

/**
 * The level to send a character in at: the matched hunt's own level, unless
 * something in this cave is far out of that hunt's league. A shared wall can
 * put a creature worth a hundred times the xp on the same patrol, and
 * inheriting "level 8" there would be an invitation to die.
 */
function recommendedLevel(population, profile) {
  const derived = derivedLevel(population);
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
  // Spawn tiles themselves make poor waypoints: a creature that never leaves
  // its home — a golem, a stationary guard — sits on one forever, and the bot
  // cannot path onto an occupied tile.
  const homes = new Set(slots.map((slot) => `${slot.home.x},${slot.home.y}`));
  const anchors = [];
  for (const slot of slots) {
    const anchor = snapToWalkable(slot.home, homes);
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

  // Every hop the bot makes must be solvable inside its runtime budget. A leg
  // that is not gets intermediate stops cut from a walk found with a wider
  // search; one that cannot be fixed even then costs its anchor, because a
  // ring is only as good as its worst leg.
  const waypoints = [];
  for (const anchor of tour) {
    const previous = waypoints.at(-1);
    if (!previous) {
      waypoints.push(anchor);
      continue;
    }
    const fillers = legFillers(previous, anchor, walk);
    if (fillers === null) continue;
    waypoints.push(...fillers, anchor);
  }
  // The ring closes, so the way home has to hold up as well.
  while (waypoints.length >= 3) {
    const fillers = legFillers(waypoints.at(-1), waypoints[0], walk);
    if (fillers === null) {
      waypoints.pop();
      continue;
    }
    waypoints.push(...fillers);
    break;
  }
  if (waypoints.length < 3) return EMPTY_RING;
  // Truncating a ring would leave its closing leg unproven, so an oversized
  // one is dropped whole instead.
  if (waypoints.length > RING.maxWaypointsPerFloor) return EMPTY_RING;
  return { waypoints, cavern: cavern.tiles };
}

/**
 * Stops to insert so a leg the bot could not solve in one search becomes a
 * chain of legs it can. Empty when the leg is already fine, and null when no
 * chain works — the caller drops the anchor rather than ship a leg the walker
 * will fail at.
 */
function legFillers(from, to, walk) {
  if (solvableAtRuntime(from, to)) return [];
  const path = walk(from, to);
  if (!path) return null;
  const fillers = [];
  let anchor = from;
  for (const step of path) {
    if (chebyshev(anchor, step) < 10) continue;
    if (!solvableAtRuntime(anchor, step)) continue;
    fillers.push(step);
    anchor = step;
  }
  return solvableAtRuntime(anchor, to) ? fillers : null;
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

function snapToWalkable(home, avoid = new Set()) {
  let fallback = null;
  for (let radius = 0; radius <= RING.maxSnapDistance; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const candidate = { x: home.x + dx, y: home.y + dy, z: home.z };
        // A protection zone cannot be fought in, so a ring through one is not
        // a hunt — town rats and depot pests drop out here.
        if (
          !map.isWalkable(candidate) ||
          !map.getGroundSpeed(candidate) ||
          map.isProtectionZone(candidate)
        ) {
          continue;
        }
        if (!avoid.has(`${candidate.x},${candidate.y}`)) return candidate;
        fallback ??= candidate;
      }
    }
  }
  // Every walkable tile around this spawn is another spawn's home; standing
  // on one is better than dropping the anchor.
  return fallback;
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
  for (let hop = 0; hop < 8 && arrival.z > SURFACE_FLOOR; hop += 1) {
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
    descents: descents.length,
    wayPath: {
      Coordinates: coordinates,
      Markers: [],
      Paths:
        steps.length > 0
          ? [`From ${town?.name ?? "the nearest temple"}: ${steps.join("; ")}.`]
          : [],
      Position: entrance,
      ...(templePosition ? { TemplePosition: templePosition } : {}),
    },
    // Where the cave is entered from open ground. A pin belongs on the floor a
    // player walks the world on, not two floors down inside the rock.
    surface: descents[0]?.source ?? entrance,
  };
}

/**
 * Whether the way down this trace found actually opens into the cave the
 * route walks. Landing one wall away from the ring is easy to do — the hole
 * above a cavern often drops into the corridor next door — and a hunt nobody
 * can enter is worse than no hunt at all.
 */
function reachableFromApproach(approach, entrance) {
  // A hunting ground on open ground is entered by walking to it: there is no
  // way down to trace, and demanding one dropped every surface hunt.
  if (entrance.z <= SURFACE_FLOOR) return true;
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
      Math.abs(link.destination.x - arrival.x) <= 80 &&
      Math.abs(link.destination.y - arrival.y) <= 80,
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
  return `${compassWord(box, town)} `;
}

/**
 * Which way out of town the cave lies, by the dominant axis rather than a
 * fixed dead zone: a cave twice as far north as it is west is "North", not
 * "NorthWest", which is how a player would describe the walk.
 */
function compassWord(box, town) {
  const dx = (box.minX + box.maxX) / 2 - town.x;
  const dy = (box.minY + box.maxY) / 2 - town.y;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return "Central";
  const ratio = Math.abs(dy) / Math.max(Math.abs(dx), 1);
  const vertical = dy < 0 ? "North" : "South";
  const horizontal = dx < 0 ? "West" : "East";
  if (ratio < 0.45) return horizontal;
  if (ratio > 2.2) return vertical;
  return `${vertical}${horizontal}`;
}

/** Names the caves of one hunt, nearest to town keeping the plain name. */
function nameSpots(caves, town) {
  const withDistance = caves.map((cave, index) => ({
    index,
    word: town ? compassWord(cave.box, town) : "",
    distance: town
      ? chebyshev(
          { x: (cave.box.minX + cave.box.maxX) / 2, y: (cave.box.minY + cave.box.maxY) / 2 },
          town,
        )
      : index,
  }));
  const names = new Array(caves.length);
  for (const word of new Set(withDistance.map((cave) => cave.word))) {
    const sharing = withDistance
      .filter((cave) => cave.word === word)
      .sort((left, right) => left.distance - right.distance);
    for (const [rank, cave] of sharing.entries()) {
      const prefix = rank === 0 ? "" : rank === 1 ? "Far " : `Far ${rank} `;
      names[cave.index] = `${prefix}${word} Cave`.trim();
    }
  }
  return names;
}

/**
 * Where a hunt's own cave is entered from open ground, traced up through the
 * map's ladders and holes the same way a generated cave's is.
 */
function surfaceEntranceOf(place, town) {
  const box = routeBox(place);
  const start =
    place.WayPath?.Position ??
    Object.values(place.RoutePath?.Coordinates ?? {})[0]?.[0]?.[0] ?? {
      x: box.minX,
      y: box.minY,
      z: box.z,
    };
  return traceApproach(start, town).surface;
}

/** The bounding box of a hunt's own drawn route, for naming it like a cave. */
function routeBox(place) {
  const points = Object.values(place.RoutePath?.Coordinates ?? {}).flatMap(
    (segments) => segments.flat(),
  );
  if (points.length === 0) {
    const position = place.WayPath?.Position ?? { x: 0, y: 0, z: 7 };
    return {
      minX: position.x,
      maxX: position.x,
      minY: position.y,
      maxY: position.y,
      z: position.z,
    };
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    z: points[0].z,
  };
}

function floorLabel(floor) {
  return floor === 7 ? "" : `-${floor - 7}`;
}

function chebyshev(first, second) {
  return Math.max(Math.abs(first.x - second.x), Math.abs(first.y - second.y));
}
