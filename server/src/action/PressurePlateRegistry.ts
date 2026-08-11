import type { Position } from "@tibia/protocol";
import type { Creature } from "../creature/Creature";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { planTransformMapItem } from "../item/plan/planTransformMapItem";
import type { MapItem } from "../MapItem";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import { mapItemAttributes } from "./mapItemAttributes";
import {
  MOVEMENT_GATES,
  type MovementGateDefinition,
} from "./movementGateTables";
import { positionKey } from "../positionKey";
import {
  PRESSURE_PLATE_DEPRESS,
  PRESSURE_PLATE_RELEASE,
  TRAP_RELEASE,
  TRAP_TILES,
  type TrapDefinition,
} from "./pressurePlateTables";
import {
  QUEST_TELEPORTS,
  type QuestTeleportDefinition,
} from "./questTeleportTables";

/** Immediate tile damage, wired to the combat damage path by the caller. */
export type TileDamageHook = (
  creature: Creature,
  damage: {
    readonly minimum: number;
    readonly maximum: number;
    readonly type: "earth" | "physical";
  },
  now: number,
) => void;

/**
 * Canary's stepin/stepout MoveEvents for pressure plates and traps. Every
 * effect is decided here, in the tick, from current tile state: the plate's
 * own item id, the tile's protection-zone flag, and the stepping player's
 * level are all re-read at execution time (charter rules 4, 5).
 */
export class PressurePlateRegistry {
  constructor(
    private readonly world: World,
    private readonly catalog: ItemCatalog,
    private readonly items: ItemIntentHandler,
    private readonly snapBack: (
      session: Session,
      player: Player,
      to: Position,
      now: number,
    ) => void,
    private readonly tileDamage?: TileDamageHook,
    private readonly effect?: (position: Position, effectId: number) => void,
    private readonly gates: ReadonlyMap<
      string,
      MovementGateDefinition
    > = MOVEMENT_GATES,
    private readonly questTeleports: ReadonlyMap<
      string,
      QuestTeleportDefinition
    > = QUEST_TELEPORTS,
  ) {}

  /** Runs after a player's step has been applied to `player.position`. */
  onStepIn(
    session: Session,
    player: Player,
    from: Position,
    now: number,
  ): void {
    const position = player.position;
    // Fixed step-in gates (level/premium bridges) run before any plate: the
    // requirement and destination are re-read at execution time, and failing
    // sends the player to the gate's own fail spot, not the previous tile.
    const gate = this.gates.get(positionKey(position));
    if (gate && !this.gatePasses(gate, player, now)) {
      if (gate.message) {
        session.send({ type: "combat-log", kind: "condition", text: gate.message });
      }
      this.effect?.(gate.failPosition, gate.effectId);
      this.snapBack(session, player, gate.failPosition, now);
      return;
    }
    // Script-driven portals (OTBM destination 0,0,0): the destination is
    // re-read here at execution time, and the effect plays where the player
    // lands, matching Canary's post-teleport sendMagicEffect.
    const teleport = this.questTeleports.get(positionKey(position));
    if (teleport) {
      this.snapBack(session, player, teleport.destination, now);
      this.effect?.(teleport.destination, teleport.effectId);
      return;
    }
    if (this.world.isProtectionZone(position)) return;
    for (const item of this.world.getMapItems(position)) {
      const trap = TRAP_TILES.get(item.itemId);
      if (trap) {
        this.springTrap(session, player, item, trap, now);
        continue;
      }
      const depressed = PRESSURE_PLATE_DEPRESS.get(item.itemId);
      if (depressed === undefined) continue;
      this.transform(session, player.id, item, position, depressed, now);
      this.enforceGate(session, player, item, from, now);
      return;
    }
  }

  /** Runs after a player left `from`; the plate rises once the tile is clear. */
  onStepOut(session: Session, player: Player, from: Position, now: number): void {
    if (this.world.isProtectionZone(from)) return;
    if (this.world.isOccupied(from)) return;
    for (const item of this.world.getMapItems(from)) {
      const released =
        PRESSURE_PLATE_RELEASE.get(item.itemId) ?? TRAP_RELEASE.get(item.itemId);
      if (released === undefined) continue;
      this.transform(session, player.id, item, from, released, now);
      return;
    }
  }

  private gatePasses(
    gate: MovementGateDefinition,
    player: Player,
    now: number,
  ): boolean {
    if (gate.requirement.kind === "level") {
      return player.level >= gate.requirement.minimum;
    }
    return player.isPremiumAt(now);
  }

  /**
   * Canary's level/storage gate: a plate carrying an action id above 1000
   * demands `actionId - 1000` levels, and any other non-zero action id is a
   * quest-storage gate. Both push the player back to the tile they came from;
   * the storage variant fails closed until the quest-storage platform ships.
   */
  private enforceGate(
    session: Session,
    player: Player,
    item: MapItem,
    from: Position,
    now: number,
  ): void {
    const actionId = mapItemAttributes(this.world, item).actionId;
    if (typeof actionId !== "number" || actionId === 0) return;
    const requiredLevel = actionId >= 1_000 ? actionId - 1_000 : undefined;
    if (requiredLevel !== undefined && player.level >= requiredLevel) return;
    session.send({
      type: "combat-log",
      kind: "condition",
      text: "The tile seems to be protected against unwanted intruders.",
    });
    this.snapBack(session, player, from, now);
  }

  private springTrap(
    session: Session,
    player: Player,
    item: MapItem,
    trap: TrapDefinition,
    now: number,
  ): void {
    if (trap.ignorePlayers) return;
    const position = player.position;
    // Canary skips a stack of spike traps so a pile cannot multi-hit.
    if (
      item.itemId === 3_482 &&
      this.world.getMapItems(position).filter((other) => other.itemId === 3_482)
        .length > 1
    ) {
      return;
    }
    if (trap.transformTo !== undefined) {
      this.transform(session, player.id, item, position, trap.transformTo, now);
    }
    if (!trap.damage) return;
    this.tileDamage?.(
      player,
      { ...trap.damage, type: trap.damageType ?? "physical" },
      now,
    );
  }

  private transform(
    session: Session,
    characterId: string,
    item: MapItem,
    position: Position,
    toTypeId: number,
    now: number,
  ): void {
    if (!this.catalog.get(toTypeId)) return;
    const plan = planTransformMapItem({
      characterId,
      catalog: this.catalog,
      world: this.world,
      instanceId: item.instanceId,
      position,
      toTypeId,
    });
    // A plate that cannot transform (missing pair data, stale version) simply
    // stays as it is; the step itself already succeeded.
    if (plan) this.items.applyWorldPlan(session, characterId, plan, now);
  }
}
