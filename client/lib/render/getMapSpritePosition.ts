import { getMapObjectZ } from "./getMapObjectZ";
import { TILE_SIZE } from "./tileSize";

interface SpritePlacement {
  x: number;
  y: number;
  zIndex: number;
}

/**
 * Places a multi-tile piece at the northwest tile it covers while sorting the
 * whole item at its anchor tile, like Tibia draws tiles: a tall sprite covers
 * everything already drawn on the tiles it spills into.
 */
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
    zIndex: getMapObjectZ(tileX, tileY, depth),
  };
}
