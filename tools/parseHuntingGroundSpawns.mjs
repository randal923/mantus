function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function integer(value, label, minimum, maximum) {
  if (
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function identifier(value, label) {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`${label} must be a lowercase identifier`);
  }
  return value;
}

function canonicalName(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function routeSegments(place, floor) {
  const routePath = record(place.RoutePath, `${place.Name} RoutePath`);
  const coordinates = record(
    routePath.Coordinates,
    `${place.Name} RoutePath.Coordinates`,
  );
  const segments = coordinates[String(floor)];
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error(`${place.Name} has no route on floor ${floor}`);
  }
  const parsedSegments = segments.map((segment, segmentIndex) => {
    if (!Array.isArray(segment) || segment.length < 2) {
      throw new Error(`${place.Name} route segment ${segmentIndex} is invalid`);
    }
    return segment.map((value, pointIndex) => {
      const point = record(
        value,
        `${place.Name} route segment ${segmentIndex} point ${pointIndex}`,
      );
      return {
        x: integer(point.x, "route x", 0, 65_535),
        y: integer(point.y, "route y", 0, 65_535),
        z: integer(point.z, "route z", 0, 15),
      };
    });
  });
  if (parsedSegments.flat().some((point) => point.z !== floor)) {
    throw new Error(`${place.Name} route point is on the wrong floor`);
  }
  return parsedSegments;
}

function squaredDistanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  }
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        (dx ** 2 + dy ** 2),
    ),
  );
  const nearestX = start.x + projection * dx;
  const nearestY = start.y + projection * dy;
  return (point.x - nearestX) ** 2 + (point.y - nearestY) ** 2;
}

function isWithinRoute(position, segments, radius) {
  return segments.some((segment) =>
    segment.slice(0, -1).some(
      (start, index) =>
        squaredDistanceToSegment(position, start, segment[index + 1]) <=
        radius ** 2,
    ),
  );
}

function parseHuntingPlaces(value) {
  if (!Array.isArray(value)) throw new Error("hunting places must be an array");
  return new Map(
    value.map((entry, index) => {
      const place = record(entry, `hunting place ${index}`);
      if (typeof place.Name !== "string" || !place.Name) {
        throw new Error(`hunting place ${index} has no name`);
      }
      if (!Array.isArray(place.Monsters)) {
        throw new Error(`${place.Name} has no monster list`);
      }
      return [place.Name, place];
    }),
  );
}

/** Parses authored spawn coverage for hunting grounds absent from Canary XML. */
export function parseHuntingGroundSpawns(options) {
  const document = record(options.document, "hunting-ground spawn document");
  if (document.formatVersion !== 1) {
    throw new Error("unsupported hunting-ground spawn format");
  }
  if (!Array.isArray(document.grounds)) {
    throw new Error("hunting-ground spawn document has no grounds");
  }
  const huntingPlaces = parseHuntingPlaces(options.huntingPlaces);
  const knownMonsterTypeIds = new Set(options.knownMonsterTypeIds);
  const usedGroundIds = new Set();
  const usedPositions = new Set(
    options.existingSlots.map(
      (slot) => `${slot.home.x},${slot.home.y},${slot.home.z}`,
    ),
  );
  const slots = [];
  const grounds = [];

  for (const [groundIndex, value] of document.grounds.entries()) {
    const ground = record(value, `hunting ground ${groundIndex}`);
    const id = identifier(ground.id, `hunting ground ${groundIndex} id`);
    if (usedGroundIds.has(id)) throw new Error(`duplicate hunting ground ${id}`);
    usedGroundIds.add(id);
    if (typeof ground.huntingPlace !== "string") {
      throw new Error(`${id} has no hunting-place name`);
    }
    const place = huntingPlaces.get(ground.huntingPlace);
    if (!place) throw new Error(`${id} references unknown hunting place`);
    if (!Array.isArray(ground.monsterTypeIds) || ground.monsterTypeIds.length === 0) {
      throw new Error(`${id} has no monster types`);
    }
    const guideTypeIds = new Set(
      place.Monsters.map((monster, monsterIndex) => {
        const parsed = record(monster, `${place.Name} monster ${monsterIndex}`);
        if (typeof parsed.Name !== "string" || !parsed.Name) {
          throw new Error(`${place.Name} monster ${monsterIndex} has no name`);
        }
        return canonicalName(parsed.Name);
      }),
    );
    const monsterTypeIds = ground.monsterTypeIds.map((typeId, typeIndex) => {
      const parsed = identifier(typeId, `${id} monster type ${typeIndex}`);
      if (!knownMonsterTypeIds.has(parsed)) {
        throw new Error(`${id} references unknown monster type ${parsed}`);
      }
      if (!guideTypeIds.has(parsed)) {
        throw new Error(`${id} monster ${parsed} is absent from its hunting guide`);
      }
      return parsed;
    });
    if (new Set(monsterTypeIds).size !== monsterTypeIds.length) {
      throw new Error(`${id} repeats a monster type`);
    }
    const radius = integer(ground.radius, `${id} radius`, 0, 32);
    const respawnMs = integer(
      ground.respawnMs,
      `${id} respawnMs`,
      1_000,
      7 * 24 * 60 * 60 * 1_000,
    );
    if (!Array.isArray(ground.positions) || ground.positions.length < monsterTypeIds.length) {
      throw new Error(`${id} has too few spawn positions`);
    }
    const floorRoutes = new Map();
    const groundSlots = ground.positions.map((value, positionIndex) => {
      const position = record(value, `${id} position ${positionIndex}`);
      const home = {
        x: integer(position.x, `${id} position ${positionIndex} x`, 0, 65_535),
        y: integer(position.y, `${id} position ${positionIndex} y`, 0, 65_535),
        z: integer(position.z, `${id} position ${positionIndex} z`, 0, 15),
      };
      const route = floorRoutes.get(home.z) ?? routeSegments(place, home.z);
      floorRoutes.set(home.z, route);
      if (!isWithinRoute(home, route, radius)) {
        throw new Error(`${id} position ${positionIndex} is outside its route`);
      }
      if (options.tileAt(home) !== "walkable") {
        throw new Error(`${id} position ${positionIndex} is not walkable`);
      }
      const positionKey = `${home.x},${home.y},${home.z}`;
      if (usedPositions.has(positionKey)) {
        throw new Error(`${id} position ${positionIndex} duplicates another spawn`);
      }
      usedPositions.add(positionKey);
      return {
        id: `hunting-ground:${id}:${String(positionIndex).padStart(3, "0")}`,
        kind: "monster",
        typeId: monsterTypeIds[positionIndex % monsterTypeIds.length],
        home,
        radius,
        respawnMs,
        direction: "south",
        enabled: true,
      };
    });
    slots.push(...groundSlots);
    grounds.push({
      id,
      huntingPlace: ground.huntingPlace,
      monsterTypeIds,
      placements: groundSlots.length,
    });
  }

  return { slots, report: { placements: slots.length, grounds } };
}
