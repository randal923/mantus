import type { Position } from "@tibia/protocol";
import type { MonsterAbility } from "../creature/MonsterType";
import type { SpellDefinition } from "./Spell";
import { directionDelta } from "./directionDelta";
import { directionToward } from "./directionToward";
import { rotateAreaOffset } from "./rotateAreaOffset";

const CANARY_RADIUS_AREA = [
  [0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 8, 8, 7, 8, 8, 0, 0, 0, 0],
  [0, 0, 0, 8, 7, 6, 6, 6, 7, 8, 0, 0, 0],
  [0, 0, 8, 7, 6, 5, 5, 5, 6, 7, 8, 0, 0],
  [0, 8, 7, 6, 5, 4, 4, 4, 5, 6, 7, 8, 0],
  [0, 8, 6, 5, 4, 3, 2, 3, 4, 5, 6, 8, 0],
  [8, 7, 6, 5, 4, 2, 1, 2, 4, 5, 6, 7, 8],
  [0, 8, 6, 5, 4, 3, 2, 3, 4, 5, 6, 8, 0],
  [0, 8, 7, 6, 5, 4, 4, 4, 5, 6, 7, 8, 0],
  [0, 0, 8, 7, 6, 5, 5, 5, 6, 7, 8, 0, 0],
  [0, 0, 0, 8, 7, 6, 6, 6, 7, 8, 0, 0, 0],
  [0, 0, 0, 0, 8, 8, 7, 8, 8, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0],
] as const;

export function areaPositions(
  origin: Position,
  center: Position,
  area: SpellDefinition["area"] | MonsterAbility["area"],
): Position[] {
  if (area.shape === "single") return [{ ...center }];
  if (area.shape === "tiles" && "offsets" in area && area.offsets) {
    const anchor = area.directional ? origin : center;
    const direction = area.directional
      ? directionToward(origin, center)
      : "north";
    const diagonal = direction === "northeast" ||
      direction === "southeast" ||
      direction === "southwest" ||
      direction === "northwest";
    const offsets = diagonal && area.diagonalOffsets
      ? area.diagonalOffsets
      : area.offsets;
    return offsets.map((offset) => {
      if (diagonal && area.diagonalOffsets) {
        const x = direction === "northeast" || direction === "southeast"
          ? -offset.x
          : offset.x;
        const y = direction === "southwest" || direction === "southeast"
          ? -offset.y
          : offset.y;
        return { x: anchor.x + x, y: anchor.y + y, z: anchor.z };
      }
      const [x, y] = rotateAreaOffset(
        offset.x,
        offset.y,
        direction,
      );
      return {
        x: anchor.x + x,
        y: anchor.y + y,
        z: anchor.z,
      };
    });
  }
  if (area.shape === "circle") {
    const radius = area.radius ?? 1;
    return CANARY_RADIUS_AREA.flatMap((row, y) =>
      row.flatMap((rank, x) =>
        rank > 0 && rank <= radius
          ? [{
              x: center.x + x - 6,
              y: center.y + y - 6,
              z: center.z,
            }]
          : [],
      ),
    );
  }
  const direction = directionToward(origin, center);
  const [forwardX, forwardY] = directionDelta(direction);
  const [sideX, sideY] = [-forwardY, forwardX];
  const length = area.length ?? 1;
  const spread = area.spread ?? 1;
  const positions: Position[] = [];
  for (let distance = 1; distance <= length; distance++) {
    const halfWidth =
      area.shape === "cone"
        ? Math.floor(((spread - 1) * distance) / Math.max(1, length) / 2)
        : 0;
    for (let side = -halfWidth; side <= halfWidth; side++) {
      positions.push({
        x: origin.x + forwardX * distance + sideX * side,
        y: origin.y + forwardY * distance + sideY * side,
        z: origin.z,
      });
    }
  }
  return positions;
}
