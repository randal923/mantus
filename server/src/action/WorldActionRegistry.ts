import type { Position, WriteMapItemMessage } from "@tibia/protocol";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { planTransformMapItem } from "../item/plan/planTransformMapItem";
import type { MapItem } from "../MapItem";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import type { ChestDefinition } from "./ChestDefinition";
import { handleChestUse } from "./handleChestUse";
import { handleClockRead } from "./handleClockRead";
import { handleDailyShrineUse } from "./handleDailyShrineUse";
import { handleImbuementShrineUse } from "./handleImbuementShrineUse";
import { handleDecorationKitUse } from "./handleDecorationKitUse";
import { handleDoorUse } from "./handleDoorUse";
import { handleFoodEat } from "./handleFoodEat";
import { handleHarvestUse } from "./handleHarvestUse";
import { handleLeverUse } from "./handleLeverUse";
import { handleMapRotate } from "./handleMapRotate";
import { handleMapWrite } from "./handleMapWrite";
import { handlePodiumUse } from "./handlePodiumUse";
import { handleSignRead } from "./handleSignRead";
import { resolveWorldAction } from "./resolveWorldAction";
import type { WorldAction } from "./WorldAction";
import { checkWorldActionPreconditions } from "./worldActionPreconditions";
import type { WorldActionContext } from "./WorldActionContext";

type RegisteredKind = Exclude<
  WorldAction["kind"],
  "map-movement" | "unsupported"
>;

type RegisteredAction = Extract<WorldAction, { kind: RegisteredKind }>;

/**
 * Typed world actions behind use-map. Resolution and every requirement check
 * run at execution time inside the tick, through the shared
 * `checkWorldActionPreconditions` table so no handler can skip one; kinds
 * without a registered handler fail closed with "item-action-failed"
 * (charter rules 4, 5).
 */
export class WorldActionRegistry {
  private readonly handlers: {
    readonly [K in RegisteredKind]: (
      context: WorldActionContext,
      action: Extract<WorldAction, { kind: K }>,
    ) => void;
  } = {
    chest: handleChestUse,
    clock: handleClockRead,
    "daily-shrine": handleDailyShrineUse,
    "imbuement-shrine": handleImbuementShrineUse,
    "decoration-kit": handleDecorationKitUse,
    door: handleDoorUse,
    food: handleFoodEat,
    harvest: handleHarvestUse,
    lever: handleLeverUse,
    podium: handlePodiumUse,
    read: handleSignRead,
    rotate: handleMapRotate,
    write: handleMapWrite,
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
    private readonly chests: ReadonlyMap<string, ChestDefinition> = new Map(),
    private readonly lootChest?: (
      session: Session,
      player: Player,
      chest: ChestDefinition,
    ) => void,
    private readonly wallClock: () => number = Date.now,
    private readonly openPodium?: (
      session: Session,
      player: Player,
      position: Position,
      item: MapItem,
    ) => void,
    private readonly openDailyRewards?: (
      session: Session,
      player: Player,
      position: Position,
      now: number,
    ) => void,
    private readonly openImbuementWindow?: (
      session: Session,
      now: number,
    ) => void,
    private readonly decorateAccess?: (
      characterId: string,
      position: Position,
    ) => boolean,
  ) {}

  /**
   * Chest use only. Canary registers quest chests by unique id, which outranks
   * the default container-open behaviour of the same item type, so this runs
   * ahead of the generic world-container path. True when consumed here.
   */
  handleChestUse(session: Session, position: Position, now: number): boolean {
    const action = this.resolve(session, position);
    if (!action || action.kind !== "chest") return false;
    return this.run(session, position, action, now);
  }

  /** True when the use was consumed here; false falls through to movement. */
  handleUseMap(session: Session, position: Position, now: number): boolean {
    const action = this.resolve(session, position);
    if (!action) return false;
    if (action.kind === "unsupported") {
      session.sendError("item-action-failed");
      return true;
    }
    return this.run(session, position, action, now);
  }

  /** Writes text onto a writeable map item; every value is re-validated here. */
  handleWriteMap(
    session: Session,
    intent: WriteMapItemMessage,
    now: number,
  ): void {
    const readable = this.resolve(session, intent.position);
    if (
      !readable ||
      readable.kind !== "read" ||
      readable.item.instanceId !== intent.itemId ||
      !readable.type.text?.writeable
    ) {
      session.sendError("item-action-failed");
      return;
    }
    this.run(
      session,
      intent.position,
      {
        kind: "write",
        item: readable.item,
        type: readable.type,
        text: intent.text,
        expectedVersion: intent.revision,
      },
      now,
    );
  }

  /** Null means nothing actionable here, or the tile is out of view entirely. */
  private resolve(
    session: Session,
    position: Position,
  ): Exclude<WorldAction, { kind: "map-movement" }> | null {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!player) return null;
    const action = resolveWorldAction(
      this.world,
      this.catalog,
      position,
      this.chests,
    );
    if (!action || action.kind === "map-movement") return null;
    return action;
  }

  /** True when the action was answered (including with a failure). */
  private run(
    session: Session,
    position: Position,
    action: RegisteredAction,
    now: number,
  ): boolean {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!player) return false;
    const rejection = checkWorldActionPreconditions({
      action,
      player,
      position,
      viewRange: session.viewRange,
      world: this.world,
      houseAccess: this.houseAccess,
      itemOperationPending: session.itemOperationPending,
    });
    // Out-of-view probes must be indistinguishable from empty tiles
    // (charter rule 6): fall through to the movement correction unanswered.
    if (rejection === "out-of-view") return false;
    if (rejection === "no-house-access") {
      session.send({
        type: "combat-log",
        kind: "condition",
        text: "Only invited guests may enter this house.",
      });
      return true;
    }
    if (rejection !== null) {
      session.sendError("item-action-failed");
      return true;
    }
    const context = this.makeContext(session, player, position, now);
    switch (action.kind) {
      case "chest":
        this.handlers.chest(context, action);
        return true;
      case "clock":
        this.handlers.clock(context, action);
        return true;
      case "daily-shrine":
        this.handlers["daily-shrine"](context, action);
        return true;
      case "imbuement-shrine":
        this.handlers["imbuement-shrine"](context, action);
        return true;
      case "decoration-kit":
        this.handlers["decoration-kit"](context, action);
        return true;
      case "door":
        this.handlers.door(context, action);
        return true;
      case "food":
        this.handlers.food(context, action);
        return true;
      case "harvest":
        this.handlers.harvest(context, action);
        return true;
      case "lever":
        this.handlers.lever(context, action);
        return true;
      case "podium":
        this.handlers.podium(context, action);
        return true;
      case "read":
        this.handlers.read(context, action);
        return true;
      case "rotate":
        this.handlers.rotate(context, action);
        return true;
      case "write":
        this.handlers.write(context, action);
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
    const lootChest = this.lootChest;
    return {
      session,
      player,
      position,
      now,
      wallClockMs: this.wallClock(),
      world: this.world,
      catalog: this.catalog,
      doorLevels: this.doorLevels,
      houseAccess: this.houseAccess,
      ...(this.decorateAccess === undefined
        ? {}
        : { decorateAccess: this.decorateAccess }),
      applyPlan: (plan) => {
        if (!plan) {
          session.sendError("item-action-failed");
          return;
        }
        this.items.applyWorldPlan(session, player.id, plan, now);
      },
      ...(lootChest === undefined
        ? {}
        : {
            lootChest: (chest: ChestDefinition) =>
              lootChest(session, player, chest),
          }),
      ...(this.openPodium === undefined
        ? {}
        : {
            openPodium: (item: MapItem) =>
              this.openPodium?.(session, player, position, item),
          }),
      ...(this.openDailyRewards === undefined
        ? {}
        : {
            openDailyRewards: () =>
              this.openDailyRewards?.(session, player, position, now),
          }),
      ...(this.openImbuementWindow === undefined
        ? {}
        : {
            openImbuementWindow: () =>
              this.openImbuementWindow?.(session, now),
          }),
    };
  }
}
