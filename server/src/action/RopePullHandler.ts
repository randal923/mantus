import type { Position } from "@tibia/protocol";
import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { ItemCatalog } from "../item/ItemCatalog";
import type { ItemIntentHandler } from "../item/ItemIntentHandler";
import { planMoveMapItem } from "../item/plan/planMoveMapItem";
import { Player } from "../Player";
import type { Session } from "../Session";
import type { SessionRegistry } from "../SessionRegistry";
import type { Visibility } from "../Visibility";
import type { World } from "../World";

/**
 * Rope used on an open hole (Canary's `onUseRope` hole arm): the topmost thing
 * standing on the floor below is lifted out beside the hole. A creature there
 * takes precedence over items, exactly as `Tile::getTopVisibleThing` does, and
 * only players are pullable — a rope never lifts a monster.
 *
 * Everything is resolved from server state inside the tick: the hole comes
 * from the converter-classified `rope-hole` action at the target, the thing
 * pulled is read from the tile below, and the destination is re-validated for
 * the pulled player specifically (pz-lock, house authorization, occupancy), so
 * one player's rope can never push another somewhere their own step could not
 * go (charter rules 1, 4, 5, 8).
 */
export class RopePullHandler {
  constructor(
    private readonly world: World,
    private readonly catalog: ItemCatalog,
    private readonly items: ItemIntentHandler,
    private readonly registry: SessionRegistry,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
  ) {}

  /** True when the target was a rope hole, whether or not anything moved. */
  handle(session: Session, target: Position, now: number): boolean {
    const action = this.world.getMapAction(target, "use-with");
    if (action?.kind !== "rope-hole") return false;
    const below = { x: target.x, y: target.y, z: target.z + 1 };
    const destination = action.destination;
    const creature = this.world.creaturesAt(below)[0];
    if (creature) {
      if (
        !(creature instanceof Player) ||
        !this.world.canPlayerEnter(creature, destination)
      ) {
        session.sendError("item-action-failed");
        return true;
      }
      this.pullPlayer(creature, destination, now);
      return true;
    }
    if (!this.pullItem(session, below, destination, now)) {
      session.sendError("item-action-failed");
    }
    return true;
  }

  private pullPlayer(player: Player, destination: Position, now: number): void {
    const pulled = this.registry.sessionFor(player.id);
    if (pulled) {
      pulled.movementDirection = null;
      pulled.bufferedMovementDirection = null;
      pulled.autoWalkDirections = [];
    }
    const from = this.world.relocateCreature(player, { ...destination });
    player.nextStepAt = now;
    if (pulled) this.visibility.onPlayerTeleported(pulled, player, from);
    else this.visibility.onCreatureStepped(player, from, 0);
    this.persistence.markDirty(player);
  }

  /**
   * The top item on the tile below, moved as one atomic operation by the
   * shared map-item plan — which is also what refuses immovable pieces and
   * pristine static seeds, so scenery can never be roped out of the world.
   */
  private pullItem(
    session: Session,
    below: Position,
    destination: Position,
    now: number,
  ): boolean {
    if (session.itemOperationPending || session.itemPersistsPending > 0) {
      return false;
    }
    const characterId = session.playerId;
    if (!characterId) return false;
    const top = [...this.world.getMapItems(below)].sort(
      (left, right) => right.stackIndex - left.stackIndex,
    )[0];
    if (!top?.mutable) return false;
    const plan = planMoveMapItem({
      characterId,
      catalog: this.catalog,
      world: this.world,
      itemInstanceId: top.instanceId,
      // Server-initiated: the current version is read here rather than taken
      // from the client, using the same default the tile projection publishes.
      expectedVersion: top.revision ?? 1,
      fromPosition: below,
      toPosition: destination,
    });
    if (!plan) return false;
    this.items.applyWorldPlan(session, characterId, plan, now);
    return true;
  }
}
