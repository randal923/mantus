import { PARTY_LIMITS, type Position } from "@tibia/protocol";

/** Canary experience-share radius: 30 tiles X/Y and one floor of difference. */
export function isWithinPartyStatusRange(a: Position, b: Position): boolean {
  return (
    Math.abs(a.x - b.x) <= PARTY_LIMITS.statusRangeX &&
    Math.abs(a.y - b.y) <= PARTY_LIMITS.statusRangeY &&
    Math.abs(a.z - b.z) <= PARTY_LIMITS.statusRangeFloors
  );
}
