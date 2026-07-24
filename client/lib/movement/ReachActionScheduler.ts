import type { Direction, Position } from "@tibia/protocol";
import { isWithinReach, walkStepsToReach } from "./walkStepsToReach";

/**
 * Canary's walk-then-use QoL: a use/pickup on an out-of-reach target auto-walks
 * the player adjacent and retries the action once on arrival. The server still
 * owns every real reach check (charter golden rule) — this only saves the
 * player a manual walk. One deferred action at a time; a new request or an
 * explicit cancel drops the previous one, so it never loops.
 */
export class ReachActionScheduler {
  private pending: { target: Position; act: () => void } | null = null;

  constructor(
    private readonly autoWalk: (directions: ReadonlyArray<Direction>) => void,
  ) {}

  /**
   * Runs `act` now if `from` is already in reach of `target`; otherwise
   * auto-walks adjacent and defers `act` to fire once on arrival.
   */
  request(from: Position, target: Position, act: () => void): void {
    this.pending = null;
    const steps = walkStepsToReach(from, target);
    if (steps.length === 0) {
      act();
      return;
    }
    this.pending = { target: { ...target }, act };
    this.autoWalk(steps);
  }

  /** Feed every own-position update; fires the deferred action once on arrival. */
  onMoved(position: Position): void {
    const pending = this.pending;
    if (pending && isWithinReach(position, pending.target)) {
      this.pending = null;
      pending.act();
    }
  }

  /** Drops a deferred action (e.g. the player walked somewhere else). */
  cancel(): void {
    this.pending = null;
  }
}
