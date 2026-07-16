interface SortPosition {
  x: number;
  y: number;
}

/** Sorts a walking creature by the tile containing its bottom-right foot point. */
export function getCreatureSortPosition(x: number, y: number): SortPosition {
  return {
    x: Math.ceil(x),
    y: Math.ceil(y),
  };
}
