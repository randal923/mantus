export interface MapData {
  name: string;
  spawn: { x: number; y: number };
  isWalkable(x: number, y: number): boolean;
}
