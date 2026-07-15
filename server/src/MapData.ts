import type { Position } from "@tibia/protocol";

export interface MapData {
  name: string;
  spawn: Position;
  isWalkable(position: Position): boolean;
}
