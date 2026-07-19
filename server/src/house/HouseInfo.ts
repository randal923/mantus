import type { Position } from "@tibia/protocol";

/** Static house metadata from the versioned content artifact (houses.json). */
export interface HouseInfo {
  readonly houseId: number;
  readonly name: string;
  readonly entry: Position;
  readonly rent: number;
  readonly townId: number;
  readonly size: number;
  readonly guildhall: boolean;
  readonly beds: number;
}
