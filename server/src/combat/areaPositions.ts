import type { Position } from "@tibia/protocol";
import type { MonsterAbility } from "../creature/MonsterType";
import type { SpellDefinition } from "./Spell";
import { directionDelta } from "./directionDelta";
import { directionToward } from "./directionToward";
import { rotateAreaOffset } from "./rotateAreaOffset";

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
    return area.offsets.map((offset) => {
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
    const positions: Position[] = [];
    for (let y = center.y - radius; y <= center.y + radius; y++) {
      for (let x = center.x - radius; x <= center.x + radius; x++) {
        if (Math.max(Math.abs(x - center.x), Math.abs(y - center.y)) > radius) {
          continue;
        }
        positions.push({ x, y, z: center.z });
      }
    }
    return positions;
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
