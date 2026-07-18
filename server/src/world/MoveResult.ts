import type { Position } from "@tibia/protocol";

export type MoveResult =
  | {
      moved: false;
      turned: boolean;
      reason: "cooldown" | "blocked" | "occupied" | "invalid-transition";
      retryAfterMs: number;
    }
  | {
      moved: true;
      turned: boolean;
      from: Position;
      durationMs: number;
    };
