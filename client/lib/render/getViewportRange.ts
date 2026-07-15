import {
  PROTOCOL_LIMITS,
  type ViewRange,
} from "@tibia/protocol";

const TILE_MARGIN = 1;

export function getViewportRange(
  width: number,
  height: number,
  renderedTileSize: number,
): ViewRange {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(renderedTileSize) ||
    width <= 0 ||
    height <= 0 ||
    renderedTileSize <= 0
  ) {
    return { x: 1, y: 1 };
  }
  return {
    x: Math.min(
      PROTOCOL_LIMITS.maxViewRangeX,
      Math.max(1, Math.ceil(width / renderedTileSize / 2) + TILE_MARGIN),
    ),
    y: Math.min(
      PROTOCOL_LIMITS.maxViewRangeY,
      Math.max(1, Math.ceil(height / renderedTileSize / 2) + TILE_MARGIN),
    ),
  };
}
