import type { Position } from "@tibia/protocol";
import type { Creature } from "../creature/Creature";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { planTransformMapItem } from "../item/plan/planTransformMapItem";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import type {
  QuestLeverBranch,
  QuestLeverDefinition,
  QuestLeverOperation,
  QuestLeverTrigger,
} from "./questLeverTables";

/** Creature relocation hooks; both re-validate the destination themselves. */
export interface QuestLeverRelocationHooks {
  readonly relocatePlayer: (player: Player, to: Position, now: number) => void;
  readonly relocateMonster: (creature: Creature, to: Position) => void;
}

/**
 * Server-authoritative stateful quest levers (Canary's uid/aid lever
 * scripts: bear room, katana room, sewer bridge). The lever item's own type
 * id carries the state, so every pull re-reads live tile state inside the
 * tick and applies the whole branch synchronously (charter rules 3, 4, 5).
 * Lever and door transforms persist through the ordinary item plan lane;
 * created span items are memory-first like corpse loot, so a restart falls
 * back to the map seed and the next pull self-repairs the state.
 */
export class QuestLeverService {
  constructor(
    private readonly world: World,
    private readonly catalog: ItemCatalog,
    private readonly items: ItemIntentHandler,
    private readonly relocations: QuestLeverRelocationHooks,
  ) {}

  /** Runs inside the tick after the registry validated reach and visibility. */
  use(
    session: Session,
    player: Player,
    position: Position,
    trigger: QuestLeverTrigger,
    now: number,
  ): void {
    const definition = trigger.definition;
    if (trigger.role === "reset") {
      // Canary's katana door: force the closed state and re-arm the levers,
      // without the doorway relocation the lever-side close performs.
      this.applyOperations(session, player, definition.reset.operations, now);
      this.setLevers(session, player, definition, definition.leverOffId, now);
      return;
    }
    const lever = this.world
      .getMapItems(position)
      .find(
        (item) =>
          item.itemId === definition.leverOffId ||
          item.itemId === definition.leverOnId,
      );
    // The lever item is the state carrier; without it the pull means nothing.
    if (!lever) {
      session.sendError("item-action-failed");
      return;
    }
    const pulling = lever.itemId === definition.leverOffId;
    const branch = pulling ? definition.pull : definition.reset;
    if (branch.requiresPrimaryTarget && !this.primaryTargetLive(branch)) {
      // Canary leaves the lever unflipped and answers nothing at all.
      return;
    }
    for (const relocation of branch.relocations ?? []) {
      this.relocateCreatures(relocation.from, relocation.to, relocation.monstersTo, now);
    }
    this.applyOperations(session, player, branch.operations, now);
    this.setLevers(
      session,
      player,
      definition,
      pulling ? definition.leverOnId : definition.leverOffId,
      now,
    );
  }

  private primaryTargetLive(branch: QuestLeverBranch): boolean {
    const primary = branch.operations[0];
    if (!primary) return false;
    const wanted =
      primary.kind === "transform" ? primary.fromItemId : primary.itemId;
    if (primary.kind === "create") {
      // A create's "target" is the tile itself; live means not already there.
      return !this.world
        .getMapItems(primary.position)
        .some((item) => item.itemId === wanted);
    }
    return this.world
      .getMapItems(primary.position)
      .some((item) => item.itemId === wanted);
  }

  private applyOperations(
    session: Session,
    player: Player,
    operations: ReadonlyArray<QuestLeverOperation>,
    now: number,
  ): void {
    for (const operation of operations) {
      this.applyOperation(session, player, operation, now);
    }
  }

  private applyOperation(
    session: Session,
    player: Player,
    operation: QuestLeverOperation,
    now: number,
  ): void {
    const placedWith = (itemId: number) =>
      this.world
        .getMapItems(operation.position)
        .find((item) => item.itemId === itemId);
    if (operation.kind === "remove") {
      const placed = placedWith(operation.itemId);
      if (!placed) return;
      this.items.removeWorldItem(placed.instanceId, operation.position, now);
      return;
    }
    if (operation.kind === "create") {
      // Idempotent: a restart may have restored the seed already.
      if (placedWith(operation.itemId)) return;
      this.items.createEventWorldItem(
        `quest-lever:${operation.position.x}:${operation.position.y}:${operation.position.z}`,
        operation.itemId,
        operation.position,
        {},
        now,
      );
      return;
    }
    const placed = placedWith(operation.fromItemId);
    if (!placed) return;
    const plan = planTransformMapItem({
      characterId: player.id,
      catalog: this.catalog,
      world: this.world,
      instanceId: placed.instanceId,
      position: operation.position,
      toTypeId: operation.toItemId,
    });
    if (plan) this.items.applyWorldPlan(session, player.id, plan, now);
  }

  private setLevers(
    session: Session,
    player: Player,
    definition: QuestLeverDefinition,
    toItemId: number,
    now: number,
  ): void {
    for (const position of definition.leverPositions) {
      const lever = this.world
        .getMapItems(position)
        .find(
          (item) =>
            item.itemId === definition.leverOffId ||
            item.itemId === definition.leverOnId,
        );
      if (!lever || lever.itemId === toItemId) continue;
      const plan = planTransformMapItem({
        characterId: player.id,
        catalog: this.catalog,
        world: this.world,
        instanceId: lever.instanceId,
        position,
        toTypeId: toItemId,
      });
      if (plan) this.items.applyWorldPlan(session, player.id, plan, now);
    }
  }

  private relocateCreatures(
    from: Position,
    to: Position,
    monstersTo: Position | undefined,
    now: number,
  ): void {
    for (const creature of [...this.world.creaturesAt(from)]) {
      if (creature.kind === "player") {
        this.relocations.relocatePlayer(creature as Player, to, now);
        continue;
      }
      // Canary routes only monsters to the split position; NPCs follow players.
      this.relocations.relocateMonster(
        creature,
        creature.kind === "monster" ? (monstersTo ?? to) : to,
      );
    }
  }
}
