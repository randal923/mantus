import { getMapObjectZ } from "./getMapObjectZ";
import { TILE_SIZE } from "./tileSize";

interface SpritePlacement {
  x: number;
  y: number;
  zIndex: number;
}

/** Places and sorts a multi-tile piece at the northwest tile it actually covers. */
export function getMapSpritePosition(
  tileX: number,
  tileY: number,
  pieceX: number,
  pieceY: number,
  displacementX: number,
  displacementY: number,
  elevation: number,
  depth: number,
): SpritePlacement {
  const physicalX = tileX - pieceX;
  const physicalY = tileY - pieceY;
  return {
    x: physicalX * TILE_SIZE - displacementX - elevation,
    y: physicalY * TILE_SIZE - displacementY - elevation,
    zIndex: getMapObjectZ(physicalX, physicalY, depth),
  };
}
