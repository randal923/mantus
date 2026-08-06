/**
 * Groups spawn slots into cave-sized populations.
 *
 * Two slots on the same floor join the same group when their homes are within
 * `linkDistance` tiles of each other (Chebyshev), and groups on neighbouring
 * floors join when their footprints overlap — one cave dug through three
 * floors is one hunting spot, not three.
 */
export function clusterSpawnGroups(
  slots,
  { linkDistance = 12, floorOverlap = 0.5, minSize = 8, maxSpan = 140 } = {},
) {
  const parents = slots.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parents[root] !== root) {
      parents[root] = parents[parents[root]];
      root = parents[root];
    }
    return root;
  };
  const union = (left, right) => {
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parents[rootLeft] = rootRight;
  };

  // A spatial hash, not every pair: a world sweep clusters 80k spawns, and
  // comparing them pairwise is hours of work for the same answer.
  const cellSize = Math.max(1, linkDistance);
  const cells = new Map();
  for (const [index, slot] of slots.entries()) {
    const key = `${Math.floor(slot.home.x / cellSize)},${Math.floor(
      slot.home.y / cellSize,
    )},${slot.home.z}`;
    const cell = cells.get(key) ?? [];
    cell.push(index);
    cells.set(key, cell);
  }
  for (const [key, indices] of cells) {
    const [cx, cy, z] = key.split(",").map(Number);
    for (let dx = 0; dx <= 1; dx += 1) {
      for (let dy = dx === 0 ? 0 : -1; dy <= 1; dy += 1) {
        const neighbours =
          dx === 0 && dy === 0 ? indices : cells.get(`${cx + dx},${cy + dy},${z}`);
        if (!neighbours) continue;
        for (const left of indices) {
          for (const right of neighbours) {
            if (right <= left && neighbours === indices) continue;
            const a = slots[left].home;
            const b = slots[right].home;
            if (
              Math.abs(a.x - b.x) <= linkDistance &&
              Math.abs(a.y - b.y) <= linkDistance
            ) {
              union(left, right);
            }
          }
        }
      }
    }
  }

  const groups = new Map();
  for (const [index, slot] of slots.entries()) {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(slot);
    groups.set(root, group);
  }

  // Stack floors: a group whose footprint sits under another group's is the
  // same cave seen one level down.
  const stacked = [...groups.values()].map((slots) => ({
    slots,
    box: boundingBox(slots),
  }));
  const stackParents = stacked.map((_, index) => index);
  const findStack = (index) => {
    let root = index;
    while (stackParents[root] !== root) {
      stackParents[root] = stackParents[stackParents[root]];
      root = stackParents[root];
    }
    return root;
  };
  // Only groups whose footprints share a coarse cell can stack, so a world
  // sweep does not compare every cave with every other cave.
  const stackCell = 96;
  const buckets = new Map();
  for (const [index, group] of stacked.entries()) {
    for (
      let cx = Math.floor((group.box.minX - floorOverlap) / stackCell);
      cx <= Math.floor((group.box.maxX + floorOverlap) / stackCell);
      cx += 1
    ) {
      for (
        let cy = Math.floor((group.box.minY - floorOverlap) / stackCell);
        cy <= Math.floor((group.box.maxY + floorOverlap) / stackCell);
        cy += 1
      ) {
        const key = `${cx},${cy}`;
        const bucket = buckets.get(key) ?? [];
        bucket.push(index);
        buckets.set(key, bucket);
      }
    }
  }
  for (const bucket of buckets.values()) {
    for (const [offset, left] of bucket.entries()) {
      for (const right of bucket.slice(offset + 1)) {
        const first = stacked[left];
        const second = stacked[right];
        if (Math.abs(first.box.z - second.box.z) !== 1) continue;
        if (overlapRatio(first.box, second.box) < floorOverlap) continue;
        const rootLeft = findStack(left);
        const rootRight = findStack(right);
        if (rootLeft !== rootRight) stackParents[rootLeft] = rootRight;
      }
    }
  }

  const merged = new Map();
  for (const [index, group] of stacked.entries()) {
    const root = findStack(index);
    const entry = merged.get(root) ?? [];
    entry.push(...group.slots);
    merged.set(root, entry);
  }

  return [...merged.values()]
    .flatMap((group) => splitOversized(group, maxSpan))
    .filter((group) => group.length >= minSize)
    .map((group) => ({ slots: group, box: boundingBox(group) }))
    .sort((left, right) => right.slots.length - left.slots.length);
}

/**
 * Cuts a spawn field too large to walk into hunt-sized pieces.
 *
 * Single-linkage clustering follows corridors, and on an open map that chains
 * a whole region into one "cave" no route could ever patrol. A field wider
 * than `maxSpan` is diced on a `maxSpan` grid instead; each piece is a
 * hunting ground of its own, which is how players use such places anyway.
 */
function splitOversized(slots, maxSpan) {
  const box = boundingBox(slots);
  if (box.maxX - box.minX <= maxSpan && box.maxY - box.minY <= maxSpan) {
    return [slots];
  }
  const pieces = new Map();
  for (const slot of slots) {
    const key = `${Math.floor(slot.home.x / maxSpan)},${Math.floor(
      slot.home.y / maxSpan,
    )},${slot.home.z}`;
    const piece = pieces.get(key) ?? [];
    piece.push(slot);
    pieces.set(key, piece);
  }
  return [...pieces.values()];
}

function boundingBox(slots) {
  const xs = slots.map((slot) => slot.home.x);
  const ys = slots.map((slot) => slot.home.y);
  const zs = slots.map((slot) => slot.home.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    // The floor with the most spawns, used for naming and stacking checks.
    z: dominantFloor(slots),
  };
}

function dominantFloor(slots) {
  const counts = new Map();
  for (const slot of slots) {
    counts.set(slot.home.z, (counts.get(slot.home.z) ?? 0) + 1);
  }
  return [...counts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0] - right[0],
  )[0][0];
}

/** How much of the smaller footprint the larger one covers, 0 to 1. */
function overlapRatio(first, second) {
  const width =
    Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX) + 1;
  const height =
    Math.min(first.maxY, second.maxY) - Math.max(first.minY, second.minY) + 1;
  if (width <= 0 || height <= 0) return 0;
  const area = (box) => (box.maxX - box.minX + 1) * (box.maxY - box.minY + 1);
  return (width * height) / Math.min(area(first), area(second));
}
