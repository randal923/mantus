import type { Direction, PlayerState } from "@tibia/protocol";

export class Player {
  lastStepAt = 0;

  constructor(
    readonly id: string,
    readonly name: string,
    public x: number,
    public y: number,
    public direction: Direction,
  ) {}

  toState(): PlayerState {
    return {
      id: this.id,
      name: this.name,
      x: this.x,
      y: this.y,
      direction: this.direction,
    };
  }
}
