import type { Direction, Position } from "@tibia/protocol";

/**
 * The slice of the map a hunting route needs: is this tile standable, and
 * does stepping onto it move the walker somewhere else (a ramp)?
 *
 * Both `MapData` and `World` satisfy this structurally. Route tracing is
 * given the `World` so it sees live door passability; tests hand it a plain
 * `gridMapData`. Occupancy is deliberately absent — a creature standing in a
 * corridor must not bake a detour into a saved route, and every step is
 * re-validated at execution time regardless.
 */
export interface RouteMap {
  isWalkable(position: Position): boolean;
  getGroundSpeed(position: Position): number | undefined;
  getTransition(
    position: Position,
    direction: Direction,
  ): { readonly destination: Position } | undefined;
}
