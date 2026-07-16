import type { Position } from "@tibia/protocol";

export function getMapPointerPosition(
  screenX: number,
  screenY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  tileSize: number,
  floor: number,
): Position {
  return {
    x: Math.floor((screenX - cameraX) / zoom / tileSize),
    y: Math.floor((screenY - cameraY) / zoom / tileSize),
    z: floor,
  };
}
