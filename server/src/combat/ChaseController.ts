import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { Creature } from "../creature/Creature";
import { CHASE_SEARCH_DISTANCE } from "../pathfinding/chaseSearchDistance";
import { findPath } from "../pathfinding/findPath";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { Visibility } from "../Visibility";
import type { MoveResult, World } from "../World";
import { isInRange } from "./isInRange";

/**
 * Enough to exhaust the whole ±12 search box: our pathfinder is a plain
 * breadth-first search, so unlike Canary's heuristic-guided 512-node A* it
 * needs the full box area to guarantee it finds any detour the box allows.
 */
const PLAYER_CHASE_PATH_BUDGET = (2 * CHASE_SEARCH_DISTANCE + 1) ** 2;
/** How long a failed search stands down before the next full-box attempt. */
const CHASE_REPATH_COOLDOWN_MS = 250;

export class ChaseController {
  /** Per-session stand-down after a failed search; success needs no pacing. */
  private readonly repathReadyAt = new Map<string, number>();

  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
  ) {}

  /**
   * `force` is the hunting bot: a bot that targets but never closes the
   * distance would just stand and watch, so while it is armed the character
   * approaches regardless of the chase fight-mode flag. The range is still
   * the weapon's own, so a distance fighter stops where it can shoot.
   */
  chaseTarget(
    session: Session,
    player: Player,
    target: Creature,
    now: number,
    range: number,
    force = false,
  ): void {
    if (!force && !session.fightMode.chase) return;
    this.stepToward(session, player, target, now, range);
  }

  /**
   * Follow mode: the same server-owned stepping as chase, but driven by the
   * follow target instead of the attack target and independent of the chase
   * fight-mode flag. Canary keeps the follower one tile away.
   */
  followTarget(
    session: Session,
    player: Player,
    target: Creature,
    now: number,
  ): void {
    this.stepToward(session, player, target, now, 1);
  }

  private stepToward(
    session: Session,
    player: Player,
    target: Creature,
    now: number,
    range: number,
  ): void {
    if (session.movementDirection || now < player.nextStepAt) return;
    if (now < (this.repathReadyAt.get(session.id) ?? 0)) return;
    const from = player.position;
    const path = findPath({
      start: from,
      isGoal: (position) => isInRange(position, target.position, range),
      canStep: (position) =>
        position.z === from.z &&
        Math.max(
          Math.abs(position.x - from.x),
          Math.abs(position.y - from.y),
        ) <= CHASE_SEARCH_DISTANCE &&
        this.world.isPathable(position) &&
        !this.world.isOccupied(position),
      maxVisited: PLAYER_CHASE_PATH_BUDGET,
    });
    const direction = path.directions[0];
    if (!direction) {
      // Nothing reachable right now. Without a pause this would re-run a
      // full-box search every 25 ms tick for as long as the target stays
      // unreachable — a stuck chaser must idle, not burn the tick budget.
      this.repathReadyAt.set(session.id, now + CHASE_REPATH_COOLDOWN_MS);
      return;
    }
    const result = this.world.tryMoveCreature(player, direction, now);
    this.publishChaseMovement(session, player, result);
  }

  private publishChaseMovement(
    session: Session,
    player: Player,
    result: MoveResult,
  ): void {
    if (result.moved) {
      this.persistence.markDirty(player);
      this.visibility.onPlayerStepped(
        session,
        player,
        result.from,
        result.durationMs,
      );
    } else if (result.turned) {
      this.persistence.markDirty(player);
      this.visibility.broadcastPose(player);
    }
  }
}
