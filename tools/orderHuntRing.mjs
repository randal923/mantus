/**
 * Orders patrol anchors into a short closed loop.
 *
 * Nearest-neighbour from the entrance anchor, then 2-opt until no swap
 * shortens the loop. `distance` is the real walked distance between two
 * anchors, so the loop respects cave walls rather than straight lines; it
 * returns `Infinity` for pairs with no walk between them, which keeps
 * unreachable anchors at the end of the tour where the caller drops them.
 */
export function orderHuntRing(anchors, distance, { maxPasses = 8 } = {}) {
  if (anchors.length <= 2) return [...anchors];
  const remaining = anchors.slice(1);
  const tour = [anchors[0]];
  while (remaining.length > 0) {
    const current = tour[tour.length - 1];
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (const [index, candidate] of remaining.entries()) {
      const length = distance(current, candidate);
      if (length < bestDistance) {
        bestDistance = length;
        bestIndex = index;
      }
    }
    tour.push(remaining.splice(bestIndex, 1)[0]);
  }

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let improved = false;
    for (let left = 1; left < tour.length - 1; left += 1) {
      for (let right = left + 1; right < tour.length; right += 1) {
        const before =
          distance(tour[left - 1], tour[left]) +
          distance(tour[right], tour[(right + 1) % tour.length]);
        const after =
          distance(tour[left - 1], tour[right]) +
          distance(tour[left], tour[(right + 1) % tour.length]);
        if (after + 1e-9 < before) {
          const reversed = tour.slice(left, right + 1).reverse();
          tour.splice(left, reversed.length, ...reversed);
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return tour;
}
