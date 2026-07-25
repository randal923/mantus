import type { Position, UseItemWithMessage } from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import { getToolDefinition, type ToolKind } from "../item/getToolDefinition";
import { isNear } from "../item/isNear";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { planTransformMapItem } from "../item/plan/planTransformMapItem";
import type { MapItem } from "../MapItem";
import type { MovementHandler } from "../MovementHandler";
import type { Player } from "../Player";
import type { ProgressionSystem } from "../progression/ProgressionSystem";
import type { Session } from "../Session";
import type { Visibility } from "../Visibility";
import type { World } from "../World";
import { handleFishingUse } from "./handleFishingUse";
import { handleMacheteUse } from "./handleMacheteUse";
import { handlePickUse } from "./handlePickUse";
import { handleScytheUse } from "./handleScytheUse";
import type { RopePullHandler } from "./RopePullHandler";
import { SHOVEL_HOLE_PAIRS } from "./shovelHolePairs";
import type { ToolUseContext } from "./ToolUseContext";
import type { WorldActionRng } from "./WorldActionRng";

/** Canary allowFarUse still requires the same floor and line of sight. */
const FAR_USE_RANGE = { x: 7, y: 5 } as const;

/**
 * Authoritative use-with tool actions. Every check runs at execution time
 * inside the tick: the item must be carried by the session's own character at
 * the claimed revision, and the target is re-validated here (distance, floor,
 * line of sight, tile state) — never trusted from the client (charter rules
 * 1, 4, 8). All harvest and catch rolls use the server's own RNG.
 */
export class ToolUseHandler {
  constructor(
    private readonly world: World,
    private readonly catalog: ItemCatalog,
    private readonly items: ItemIntentHandler,
    private readonly movement: MovementHandler,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
    private readonly progression: ProgressionSystem,
    private readonly ropePull: RopePullHandler,
    private readonly rng: WorldActionRng,
    private readonly spawnMonster?: (
      typeName: string,
      position: Position,
      now: number,
    ) => void,
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
    const target = intent.targetPosition;
    if (!this.inReach(player, target, tool.allowFarUse ?? false)) {
      session.sendError("item-action-failed");
      return true;
    }
    if (tool.kind === "rope") {
      // Canary's onUseRope order: a rope spot climbs the user out, otherwise
      // an open hole lifts whoever is below it. The two are mutually exclusive
      // per tile — the converter gives a rope spot precedence, as Canary does.
      if (!this.ropePull.handle(session, target, now)) {
        this.movement.handleRopeUse(session, target, now);
      }
      return true;
    }
    if (tool.kind === "shovel") {
      this.handleShovel(session, playerId, target, now);
      return true;
    }
    if (session.itemOperationPending || session.itemPersistsPending > 0) {
      session.sendError("item-action-failed");
      return true;
    }
    if (!this.runTool(tool.kind, session, player, target, now)) {
      session.sendError("item-action-failed");
    }
    return true;
  }

  private runTool(
    kind: ToolKind,
    session: Session,
    player: Player,
    target: Position,
    now: number,
  ): boolean {
    const context = this.makeContext(session, player, target, now);
    switch (kind) {
      case "machete":
        return handleMacheteUse(context);
      case "scythe":
        return handleScytheUse(context);
      case "pick":
        return handlePickUse(context);
      case "fishing-rod":
        return handleFishingUse(context);
      // Every crowbar branch in Canary's register_actions.lua is gated on a
      // quest storage value, so the tool stays registered (the client shows
      // its crosshair) and fails closed until the quest platform ships.
      default:
        return false;
    }
  }

  private inReach(
    player: Player,
    target: Position,
    allowFarUse: boolean,
  ): boolean {
    if (isNear(player.position, target)) return true;
    if (!allowFarUse) return false;
    return (
      player.position.z === target.z &&
      Math.abs(target.x - player.position.x) <= FAR_USE_RANGE.x &&
      Math.abs(target.y - player.position.y) <= FAR_USE_RANGE.y &&
      this.world.hasLineOfSight(player.position, target)
    );
  }

  private makeContext(
    session: Session,
    player: Player,
    target: Position,
    now: number,
  ): ToolUseContext {
    return {
      session,
      player,
      target,
      now,
      world: this.world,
      catalog: this.catalog,
      rng: this.rng,
      targetItems: [...this.world.getMapItems(target)].sort(
        (left, right) => right.stackIndex - left.stackIndex,
      ),
      transform: (item, toTypeId) =>
        this.transform(session, player.id, item, target, toTypeId, now),
      remove: (item) => this.items.removeWorldItem(item.instanceId, target, now),
      createOnTarget: (typeId) =>
        this.items.createEventWorldItem(
          `tool-harvest:${player.id}`,
          typeId,
          target,
          {},
          now,
        ) !== null,
      grantCarried: (typeId, count, consumeTypeId) =>
        this.grantCarried(session, player, typeId, count, consumeTypeId, now),
      carriedCount: (typeId) =>
        (this.items.inventorySnapshot(player.id)?.items ?? [])
          .filter((candidate) => candidate.typeId === typeId)
          .reduce((total, candidate) => total + candidate.count, 0),
      effect: (effectId) => {
        this.visibility.broadcastMagicEffect(target, effectId);
      },
      say: (text) => {
        session.send({ type: "combat-log", kind: "condition", text });
      },
      advanceFishing: (tries) => {
        this.progression.awardSkillTries(
          player.id,
          `fishing:${player.id}:${now}`,
          "fishing",
          tries,
          now,
        );
      },
      ...(this.spawnMonster === undefined
        ? {}
        : {
            spawnMonster: (typeName: string) => {
              this.spawnMonster?.(typeName, target, now);
            },
          }),
    };
  }

  private transform(
    session: Session,
    characterId: string,
    item: MapItem,
    position: Position,
    toTypeId: number,
    now: number,
  ): boolean {
    const plan = planTransformMapItem({
      characterId,
      catalog: this.catalog,
      world: this.world,
      instanceId: item.instanceId,
      position,
      toTypeId,
    });
    if (!plan) return false;
    this.items.applyWorldPlan(session, characterId, plan, now);
    return true;
  }

  /**
   * One atomic carried grant. Canary's `player:removeItem("worm", 1)` plus
   * `player:addItem(...)` becomes a single conjure here, so the bait and the
   * catch commit together or not at all (charter rule 2).
   */
  private grantCarried(
    session: Session,
    player: Player,
    typeId: number,
    count: number,
    consumeTypeId: number | undefined,
    now: number,
  ): boolean {
    const type = this.catalog.get(typeId);
    if (!type?.pickupable) return false;
    const expectedVersion = this.persistence.beginExternalMutation(player, now);
    const started = this.items.conjureForCombat(
      session,
      expectedVersion,
      player.mana,
      player.progression.soul,
      0,
      0,
      consumeTypeId ?? 0,
      typeId,
      Math.max(1, Math.min(count, type.maxCount)),
      (version, characterVersion, committedAt) => {
        this.persistence.completeExternalMutation(
          player,
          version,
          characterVersion,
        );
        this.progression.syncPlayer(player, committedAt, true);
      },
      (failedAt) => {
        this.persistence.cancelExternalMutation(player);
        this.persistence.saveNow(player, failedAt);
      },
    );
    if (!started) this.persistence.cancelExternalMutation(player);
    return started;
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
    target: Position,
    now: number,
  ): void {
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
    const toTypeId = SHOVEL_HOLE_PAIRS.get(pile.itemId);
    if (
      toTypeId === undefined ||
      !this.transform(session, playerId, pile, target, toTypeId, now)
    ) {
      session.sendError("item-action-failed");
      return;
    }
    this.movement.handleHoleFall(session, target, now);
  }
}
