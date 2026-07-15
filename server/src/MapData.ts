export interface MapData {
  name: string;
  spawn: { x: number; y: number; z: number };
  isWalkable(x: number, y: number, z: number): boolean;
}
