import {
  computeWheelBonuses,
  validateWheelAllocation,
  WHEEL_LIMITS,
  wheelPointsForLevel,
  type WheelActionFailedReason,
  type WheelSaveMessage,
  type WheelStateMessage,
} from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { Player } from "../Player";
import { getVocation } from "../progression/getVocation";
import { projectOwnProgression } from "../progression/projectOwnProgression";
import type { Session } from "../Session";
import type { World } from "../World";
import type { GemTracker } from "./GemTracker";
import type { WheelTracker } from "./WheelTracker";

const MAX_TRACKED_REQUEST_IDS = 64;

/**
 * Handles wheel reads and allocation saves. Every rule (point budget from
 * the character's execution-time level, slice caps, connectivity, premium
 * gate) is re-validated here inside the tick; the client's preview is
 * decoration (charter rules 4 and 8).
 */
export class WheelService {
  private readonly cooldownBySession = new Map<string, number>();
  private readonly requestIdsBySession = new Map<string, Set<string>>();

  constructor(
    private readonly world: World,
    private readonly tracker: WheelTracker,
    private readonly persistence: CharacterPersistence,
    private readonly gems?: GemTracker,
  ) {}

  detach(session: Session): void {
    this.cooldownBySession.delete(session.id);
    this.requestIdsBySession.delete(session.id);
  }

  handleGet(session: Session, now: number): void {
    const player = this.guard(session, now, WHEEL_LIMITS.readCooldownMs);
    if (!player) return;
    session.send(this.projectState(player, now));
  }

  handleSave(session: Session, intent: WheelSaveMessage, now: number): void {
    const player = this.guard(session, now, WHEEL_LIMITS.actionCooldownMs);
    if (!player) return;
    const seen = this.requestIdsBySession.get(session.id) ?? new Set<string>();
    if (seen.has(intent.requestId)) {
      // Replayed intent: acknowledge idempotently with the current state.
      session.send(this.projectState(player, now));
      return;
    }
    if (!this.isUnlocked(player, now)) {
      this.fail(session, "unavailable");
      return;
    }
    const totalPoints = wheelPointsForLevel(player.level);
    const result = validateWheelAllocation(intent.slices, totalPoints);
    if (!result.ok) {
      this.fail(session, "invalid-allocation");
      return;
    }
    seen.add(intent.requestId);
    if (seen.size > MAX_TRACKED_REQUEST_IDS) {
      const oldest = seen.values().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }
    this.requestIdsBySession.set(session.id, seen);
    // Synchronous in-memory mutation inside the tick, then write-behind
    // persistence (charter rule 3).
    this.tracker.set(player.id, intent.slices);
    player.setWheelBonuses(
      computeWheelBonuses(
        intent.slices,
        player.vocation,
        this.gems && {
          equipped: this.gems.equippedGems(player.id),
          grades: this.gems.dataFor(player.id).grades,
        },
      ),
    );
    this.persistence.saveNow(player, now);
    session.send(this.projectState(player, now));
    session.send({
      type: "progression-updated",
      playerId: player.id,
      progression: projectOwnProgression(player, now),
    });
  }

  private projectState(player: Player, now: number): WheelStateMessage {
    return {
      type: "wheel-state",
      slices: [...this.tracker.slicesFor(player.id)],
      totalPoints: Math.min(
        WHEEL_LIMITS.maxTotalPoints,
        wheelPointsForLevel(player.level),
      ),
      unlocked: this.isUnlocked(player, now),
    };
  }

  private isUnlocked(player: Player, now: number): boolean {
    return (
      player.level >= WHEEL_LIMITS.minLevel &&
      player.isPremiumAt(now) &&
      getVocation(player.vocation).promotedFrom !== null
    );
  }

  private guard(
    session: Session,
    now: number,
    cooldownMs: number,
  ): Player | null {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!player) {
      session.sendError("join-required");
      return null;
    }
    const readyAt = this.cooldownBySession.get(session.id) ?? 0;
    if (now < readyAt) {
      this.fail(session, "rate-limited");
      return null;
    }
    this.cooldownBySession.set(session.id, now + cooldownMs);
    return player;
  }

  private fail(session: Session, reason: WheelActionFailedReason): void {
    session.send({ type: "wheel-action-failed", reason });
  }
}
