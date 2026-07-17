import type { Direction } from "@tibia/protocol";
import type { Npc } from "../creature/Npc";
import type { MoveResult, World } from "../World";

const DIRECTIONS: Direction[] = ["north", "east", "south", "west"];

export class NpcBrain {
  private nextThinkAt: number;
  private randomState: number;

  constructor(
    private readonly npc: Npc,
    now: number,
    seed: number,
  ) {
    this.randomState = this.seedFor(seed, npc.id);
    this.nextThinkAt = npc.type.walkIntervalMs > 0
      ? now + (this.randomState % npc.type.walkIntervalMs)
      : Number.POSITIVE_INFINITY;
  }

  tick(
    world: World,
    now: number,
    availableWork: number,
  ): { work: number; movement: MoveResult | null } {
    if (
      availableWork <= 0 ||
      this.npc.type.walkIntervalMs <= 0 ||
      now < this.nextThinkAt
    ) {
      return { work: 0, movement: null };
    }
    if (this.npc.isInConversation) {
      this.nextThinkAt = now + this.npc.type.walkIntervalMs;
      return { work: 1, movement: null };
    }
    this.nextThinkAt = Math.max(
      now + this.npc.type.walkIntervalMs,
      this.npc.nextStepAt,
    );
    if (this.npc.spawnRadius === 0) return { work: 1, movement: null };
    const first = Math.floor(this.random() * DIRECTIONS.length);
    let lastMovement: MoveResult | null = null;
    for (let offset = 0; offset < DIRECTIONS.length; offset++) {
      const direction = DIRECTIONS[(first + offset) % DIRECTIONS.length];
      if (!direction) continue;
      const movement = world.tryMoveCreature(this.npc, direction, now, {
        home: this.npc.home,
        radius: this.npc.spawnRadius,
      });
      if (movement.moved) return { work: 1, movement };
      lastMovement = movement;
    }
    return {
      work: 1,
      movement: lastMovement?.turned ? lastMovement : null,
    };
  }

  private random(): number {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0 || 0x9e3779b9;
    return this.randomState / 0x1_0000_0000;
  }

  private seedFor(seed: number, id: string): number {
    let value = seed >>> 0;
    for (let index = 0; index < id.length; index++) {
      value = Math.imul(value ^ id.charCodeAt(index), 16_777_619) >>> 0;
    }
    return value || 0x9e3779b9;
  }
}
