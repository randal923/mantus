/**
 * How far from the searcher a chase path search may wander, in tiles per
 * axis. Canary parity: every creature's follow-path search is boxed to ±12
 * around the searcher (`Creature::getPathSearchParams` sets
 * `fpp.maxSearchDist = 12`, creature.cpp:1041, enforced per-axis in
 * map.cpp:1297), and that box always covers the 11-tile creature view range
 * (map_const.hpp:12-15). Anything a creature can see it can therefore also
 * path to — vision implies chase.
 */
export const CHASE_SEARCH_DISTANCE = 12;
