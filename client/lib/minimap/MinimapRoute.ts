import type { Position } from "@tibia/protocol";

export interface MinimapRoute {
  readonly name: string;
  readonly coordinates: Readonly<
    Record<string, ReadonlyArray<readonly [Position, Position]>>
  >;
  readonly destination?: Position;
}
