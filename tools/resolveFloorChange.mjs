export function resolveFloorChange(source, floorChange, floorChangeAt) {
  if (floorChange === "down") {
    if (source.z >= 15) return null;
    const floor = source.z + 1;
    if (
      floorChangeAt({ x: source.x, y: source.y - 1, z: floor }) ===
      "southalt"
    ) {
      return { x: source.x, y: source.y - 2, z: floor };
    }
    if (
      floorChangeAt({ x: source.x - 1, y: source.y, z: floor }) ===
      "eastalt"
    ) {
      return { x: source.x - 2, y: source.y, z: floor };
    }
    const lower = floorChangeAt({ x: source.x, y: source.y, z: floor });
    const offsets = {
      north: [0, 1],
      south: [0, -1],
      southalt: [0, -2],
      east: [-1, 0],
      eastalt: [-2, 0],
      west: [1, 0],
    };
    const [x = 0, y = 0] = offsets[lower] ?? [];
    return { x: source.x + x, y: source.y + y, z: floor };
  }
  if (source.z <= 0) return null;
  const offsets = {
    north: [0, -1],
    south: [0, 1],
    southalt: [0, 2],
    east: [1, 0],
    eastalt: [2, 0],
    west: [-1, 0],
  };
  const offset = offsets[floorChange];
  if (!offset) throw new Error(`unknown floor change ${floorChange}`);
  return {
    x: source.x + offset[0],
    y: source.y + offset[1],
    z: source.z - 1,
  };
}
