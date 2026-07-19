import { TRADE_LIMITS, type Position } from "@tibia/protocol";

/** Canary's areInRange<2,2,0>: within 2 tiles on each axis, same floor. */
export function withinTradeRange(a: Position, b: Position): boolean {
  return (
    a.z === b.z &&
    Math.abs(a.x - b.x) <= TRADE_LIMITS.maxPartnerDistance &&
    Math.abs(a.y - b.y) <= TRADE_LIMITS.maxPartnerDistance
  );
}
