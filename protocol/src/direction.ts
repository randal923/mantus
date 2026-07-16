export const DIRECTIONS = [
  "north",
  "east",
  "south",
  "west",
  "northeast",
  "southeast",
  "southwest",
  "northwest",
] as const;

export type Direction = (typeof DIRECTIONS)[number];
