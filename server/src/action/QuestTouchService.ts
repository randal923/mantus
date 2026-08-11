import type { Position } from "@tibia/protocol";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import type { Player } from "../Player";
import { positionKey } from "../positionKey";
import type { Session } from "../Session";
import type { QuestTouchDefinition } from "./questTouchTables";
import type { WorldActionWorldView } from "./WorldActionWorldView";

interface PendingRestore {
  readonly at: number;
  readonly typeId: number;
  readonly position: Position;
}

/** A restore blocked by a full tile stack tries again after this long. */
const RESTORE_RETRY_MS = 1_000;

/**
 * Server-authoritative quest touches on baked scenery (Canary's Cults of
 * Tibia torch). The world-shared cooldown and the pending wall restores live
 * here, in memory: every mutation runs synchronously inside the tick, and
 * restores are drained from the per-tick `applyResolvedOutcomes` path —
 * never a timer callback (charter rules 3, 5). A restart forgets both, so a
 * removed wall simply returns at boot with the map seed (recorded in
 * TODO.md).
 */
export class QuestTouchService {
  /** World-shared (not per-character) re-arm stamps, keyed by touch tile. */
  private readonly cooldownUntil = new Map<string, number>();
  private pendingRestores: PendingRestore[] = [];

  constructor(
    private readonly world: WorldActionWorldView,
    private readonly items: ItemIntentHandler,
    private readonly effect: (position: Position, effectId: number) => void,
  ) {}

  /** Runs inside the tick after the registry validated reach and visibility. */
  use(
    session: Session,
    player: Player,
    position: Position,
    touch: QuestTouchDefinition,
    now: number,
  ): void {
    const key = touch.cooldownKey ?? positionKey(position);
    if ((this.cooldownUntil.get(key) ?? 0) > now) {
      // Canary: within the global cooldown only a poff at the player.
      this.effect(player.position, touch.effectId);
      return;
    }
    let moved = false;
    for (const removal of touch.removals) {
      const placed = this.world
        .getMapItems(removal.position)
        .find((candidate) => candidate.itemId === removal.itemId);
      if (!placed) continue;
      if (!this.items.removeWorldItem(placed.instanceId, removal.position, now)) {
        continue;
      }
      this.effect(removal.position, touch.effectId);
      this.pendingRestores.push({
        at: now + touch.restoreAfterMs,
        typeId: removal.itemId,
        position: removal.position,
      });
      moved = true;
    }
    // Nothing placed and no cooldown: Canary falls through silently, so the
    // use is consumed with no message at all.
    if (!moved) return;
    session.send({ type: "combat-log", kind: "condition", text: touch.message });
    this.cooldownUntil.set(key, now + touch.cooldownSeconds * 1_000);
  }

  /** Re-creates due removals; called once per tick (never from a timer). */
  applyResolvedOutcomes(now: number): void {
    if (this.pendingRestores.length === 0) return;
    const due: PendingRestore[] = [];
    const remaining: PendingRestore[] = [];
    for (const restore of this.pendingRestores) {
      (restore.at <= now ? due : remaining).push(restore);
    }
    if (due.length === 0) return;
    this.pendingRestores = remaining;
    for (const restore of due) {
      const alreadyBack = this.world
        .getMapItems(restore.position)
        .some((candidate) => candidate.itemId === restore.typeId);
      if (alreadyBack) continue;
      const created = this.items.createEventWorldItem(
        `quest-touch:${restore.position.x}:${restore.position.y}:${restore.position.z}`,
        restore.typeId,
        restore.position,
        {},
        now,
      );
      if (created === null) {
        // The tile stack was full; keep the restore pending rather than
        // losing the wall forever.
        this.pendingRestores.push({ ...restore, at: now + RESTORE_RETRY_MS });
      }
    }
  }
}
