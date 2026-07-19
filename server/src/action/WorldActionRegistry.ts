import type { Position } from "@tibia/protocol";
import { isNear } from "../item/isNear";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { planTransformMapItem } from "../item/plan/planTransformMapItem";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import { handleDoorUse } from "./handleDoorUse";
import { handleLeverUse } from "./handleLeverUse";
import { handleMapRotate } from "./handleMapRotate";
import { handleSignRead } from "./handleSignRead";
import { resolveWorldAction } from "./resolveWorldAction";
import type { WorldAction } from "./WorldAction";
import type { WorldActionContext } from "./WorldActionContext";

type RegisteredKind = Exclude<
  WorldAction["kind"],
  "map-movement" | "unsupported"
>;

/**
 * Typed world actions behind use-map. Resolution and every requirement check
 * run at execution time inside the tick; kinds without a registered handler
 * fail closed with "item-action-failed" (charter rules 4, 5).
 */
export class WorldActionRegistry {
  private readonly handlers: {
    readonly [K in RegisteredKind]: (
      context: WorldActionContext,
      action: Extract<WorldAction, { kind: K }>,
    ) => void;
  } = {
    door: handleDoorUse,
    lever: handleLeverUse,
    read: handleSignRead,
    rotate: handleMapRotate,
  };

  constructor(
    private readonly world: World,
    private readonly catalog: ItemCatalog,
    private readonly items: ItemIntentHandler,
    private readonly doorLevels: ReadonlyMap<string, number>,
    private readonly houseAccess: (
      characterId: string,
      position: Position,
    ) => boolean = () => true,
  ) {}

  /** True when the use was consumed here; false falls through to movement. */
  handleUseMap(session: Session, position: Position, now: number): boolean {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!playerId || !player) return false;
    // Out-of-view probes must be indistinguishable from empty tiles
    // (charter rule 6): fall through to the movement correction unanswered.
    if (
      !isNear(player.position, position) &&
      !this.world.canSee(player.position, position, session.viewRange)
    ) {
      return false;
    }
    const action = resolveWorldAction(this.world, this.catalog, position);
    if (!action || action.kind === "map-movement") return false;
    if (action.kind === "unsupported") {
      session.sendError("item-action-failed");
      return true;
    }
    if (session.itemOperationPending) {
      session.sendError("item-action-failed");
      return true;
    }
    // Sign reading validates its own distance rule (allowDistanceRead).
    if (action.kind !== "read" && !isNear(player.position, position)) {
      session.sendError("item-action-failed");
      return true;
    }
    const context = this.makeContext(session, player, position, now);
    switch (action.kind) {
      case "door":
        this.handlers.door(context, action);
        return true;
      case "lever":
        this.handlers.lever(context, action);
        return true;
      case "read":
        this.handlers.read(context, action);
        return true;
      case "rotate":
        this.handlers.rotate(context, action);
        return true;
    }
  }

  /**
   * Canary's closing_door step-out event: an open level or quest door closes
   * behind the player once its tile is clear again.
   */
  closeDoorBehind(
    session: Session,
    player: Player,
    from: Position,
    now: number,
  ): void {
    if (!this.world.getDoorOverride(from)?.walkable) return;
    if (this.world.isOccupied(from)) return;
    for (const item of this.world.getMapItems(from)) {
      const door = this.catalog.get(item.itemId)?.door;
      if (!door || door.role !== "open") continue;
      if (door.variant !== "level" && door.variant !== "quest") continue;
      const plan = planTransformMapItem({
        characterId: player.id,
        catalog: this.catalog,
        world: this.world,
        instanceId: item.instanceId,
        position: from,
        toTypeId: door.closedId,
      });
      if (plan) this.items.applyWorldPlan(session, player.id, plan, now);
      return;
    }
  }

  private makeContext(
    session: Session,
    player: Player,
    position: Position,
    now: number,
  ): WorldActionContext {
    return {
      session,
      player,
      position,
      now,
      world: this.world,
      catalog: this.catalog,
      doorLevels: this.doorLevels,
      houseAccess: this.houseAccess,
      applyPlan: (plan) => {
        if (!plan) {
          session.sendError("item-action-failed");
          return;
        }
        this.items.applyWorldPlan(session, player.id, plan, now);
      },
    };
  }
}
