export const DIRECTIONS = ["north", "east", "south", "west"] as const;

export type Direction = (typeof DIRECTIONS)[number];
