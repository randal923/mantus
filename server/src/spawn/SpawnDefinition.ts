import type { CreatureKind, Direction, Position } from "@tibia/protocol";

export interface SpawnSlotDefinition {
  id: string;
  kind: Exclude<CreatureKind, "player">;
  typeId: string;
  home: Position;
  radius: number;
  respawnMs: number;
  direction: Direction;
  enabled: boolean;
}
