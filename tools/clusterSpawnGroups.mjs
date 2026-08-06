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
  { linkDistance = 12, floorOverlap = 8, minSize = 8 } = {},
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

  const byFloor = new Map();
  for (const [index, slot] of slots.entries()) {
    const floor = byFloor.get(slot.home.z) ?? [];
    floor.push(index);
    byFloor.set(slot.home.z, floor);
  }
  for (const indices of byFloor.values()) {
    for (const [offset, left] of indices.entries()) {
      for (const right of indices.slice(offset + 1)) {
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
  for (const [left, first] of stacked.entries()) {
    for (const [offsetRight, second] of stacked.slice(left + 1).entries()) {
      const right = left + 1 + offsetRight;
      if (Math.abs(first.box.z - second.box.z) !== 1) continue;
      if (!overlaps(first.box, second.box, floorOverlap)) continue;
      const rootLeft = findStack(left);
      const rootRight = findStack(right);
      if (rootLeft !== rootRight) stackParents[rootLeft] = rootRight;
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
    .filter((group) => group.length >= minSize)
    .map((group) => ({ slots: group, box: boundingBox(group) }))
    .sort((left, right) => right.slots.length - left.slots.length);
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

function overlaps(first, second, margin) {
  return (
    first.minX - margin <= second.maxX &&
    second.minX - margin <= first.maxX &&
    first.minY - margin <= second.maxY &&
    second.minY - margin <= first.maxY
  );
}
