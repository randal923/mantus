import type { UseItemWithMessage } from "@tibia/protocol";
import { getToolDefinition } from "../item/getToolDefinition";
import { isNear } from "../item/isNear";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { planTransformMapItem } from "../item/plan/planTransformMapItem";
import type { MovementHandler } from "../MovementHandler";
import type { Session } from "../Session";
import type { World } from "../World";
import { SHOVEL_HOLE_PAIRS } from "./shovelHolePairs";

/**
 * Authoritative use-with tool actions (rope, shovel). Every check runs at
 * execution time inside the tick: the item must be carried by the session's
 * own character at the claimed revision, and the target is re-validated by
 * the movement rules (distance, occupancy, cooldown) — never trusted from
 * the client (charter rules 1, 4, 8).
 */
export class ToolUseHandler {
  constructor(
    private readonly world: World,
    private readonly catalog: ItemCatalog,
    private readonly items: ItemIntentHandler,
    private readonly movement: MovementHandler,
  ) {}

  /** True when the intent was consumed as a tool use. */
  handle(session: Session, intent: UseItemWithMessage, now: number): boolean {
    const playerId = session.playerId;
    if (!playerId) return false;
    const player = this.world.getPlayer(playerId);
    if (!player) return false;
    const snapshot = this.items.inventorySnapshot(playerId);
    const item = snapshot?.items.find(
      (candidate) => candidate.id === intent.itemId,
    );
    // Missing or stale items fall through to the item handler, which reports
    // the failure through its regular validation path.
    if (!item || item.version !== intent.revision) return false;
    const tool = getToolDefinition(item.typeId);
    if (!tool) return false;
    if (tool.kind === "rope") {
      this.movement.handleRopeUse(session, intent.targetPosition, now);
      return true;
    }
    this.handleShovel(session, playerId, intent.targetPosition, now);
    return true;
  }

  /**
   * Canary's onUseShovel core: a closed pile on the target tile transforms
   * to its open hole (catalog decay closes it again) and the digger drops
   * one floor. The pile item, adjacency, and the plan's version check are
   * all evaluated here, at execution time.
   */
  private handleShovel(
    session: Session,
    playerId: string,
    target: UseItemWithMessage["targetPosition"],
    now: number,
  ): void {
    const player = this.world.getPlayer(playerId);
    if (!player || !isNear(player.position, target)) {
      session.sendError("item-action-failed");
      return;
    }
    if (session.itemOperationPending) {
      session.sendError("item-action-failed");
      return;
    }
    const pile = this.world
      .getMapItems(target)
      .find((candidate) => SHOVEL_HOLE_PAIRS.has(candidate.itemId));
    if (!pile) {
      session.sendError("item-action-failed");
      return;
    }
    const plan = planTransformMapItem({
      characterId: playerId,
      catalog: this.catalog,
      world: this.world,
      instanceId: pile.instanceId,
      position: target,
      toTypeId: SHOVEL_HOLE_PAIRS.get(pile.itemId)!,
    });
    if (!plan) {
      session.sendError("item-action-failed");
      return;
    }
    this.items.applyWorldPlan(session, playerId, plan, now);
    this.movement.handleHoleFall(session, target, now);
  }
}
