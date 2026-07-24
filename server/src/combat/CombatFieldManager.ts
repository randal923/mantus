import type { Position } from "@tibia/protocol";
import { positionKey } from "../positionKey";

interface CombatField {
  readonly position: Position;
  readonly type: "energy" | "fire" | "poison";
  readonly sourceId: string;
  readonly expiresAt: number;
}

export class CombatFieldManager {
  private readonly fields = new Map<string, CombatField>();
  private currentRevision = 0;

  get revision(): number {
    return this.currentRevision;
  }

  create(
    position: Position,
    type: CombatField["type"],
    sourceId: string,
    now: number,
  ): void {
    const durationMs = type === "fire"
      ? 446_000
      : type === "poison"
        ? 248_000
        : 98_000;
    this.fields.set(positionKey(position), {
      position: { ...position },
      type,
      sourceId,
      expiresAt: now + durationMs,
    });
    this.currentRevision++;
  }

  get(position: Position, now: number): CombatField | undefined {
    const key = positionKey(position);
    const field = this.fields.get(key);
    if (!field) return undefined;
    if (field.expiresAt > now) return field;
    this.fields.delete(key);
    this.currentRevision++;
    return undefined;
  }

  tick(now: number): void {
    for (const [key, field] of this.fields) {
      if (field.expiresAt > now) continue;
      this.fields.delete(key);
      this.currentRevision++;
    }
  }
}
