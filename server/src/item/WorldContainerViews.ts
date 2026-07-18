import type { Position } from "@tibia/protocol";
import type { Session } from "../Session";
import type { World } from "../World";
import { isNear } from "./isNear";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { projectWorldContainer } from "./projectWorldContainer";

interface WorldContainerView {
  containerId: string;
  signature: string;
}

/**
 * Per-session views into world containers (corpses). One view per session;
 * contents are re-validated and reconciled every tick so any mutation source
 * (loot, decay, another player) reaches every viewer, and views auto-close
 * when the root disappears or the player steps out of reach.
 */
export class WorldContainerViews {
  private readonly views = new Map<Session, WorldContainerView>();

  constructor(
    private readonly world: World,
    private readonly catalog: ItemCatalog,
  ) {}

  /**
   * Handles use-map on a tile holding a materialized world container. Returns
   * true when the tile was handled (opened or rejected), false to let the
   * intent fall through to map transitions.
   */
  open(session: Session, position: Position): boolean {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!playerId || !player) return false;
    const root = this.findContainerRoot(position);
    if (!root) return false;
    if (!isNear(player.position, position)) {
      session.sendError("item-action-failed");
      return true;
    }
    const owner = root.attributes.ownerCharacterId;
    if (typeof owner === "string" && owner !== playerId) {
      session.sendError("loot-protected");
      return true;
    }
    const previous = this.views.get(session);
    if (previous && previous.containerId !== root.id) {
      session.send({
        type: "world-container-closed",
        containerId: previous.containerId,
      });
    }
    this.views.set(session, {
      containerId: root.id,
      signature: this.signatureOf(root),
    });
    this.sendState(session, root);
    return true;
  }

  close(session: Session, containerId: string): void {
    const view = this.views.get(session);
    if (!view || view.containerId !== containerId) return;
    this.views.delete(session);
    session.send({ type: "world-container-closed", containerId });
  }

  has(session: Session, containerId: string): boolean {
    return this.views.get(session)?.containerId === containerId;
  }

  detach(session: Session): void {
    this.views.delete(session);
  }

  /** Revalidates every view and pushes content changes to its viewer. */
  tick(): void {
    for (const [session, view] of this.views) {
      const root = this.world.getWorldItem(view.containerId);
      const playerId = session.playerId;
      const player = playerId ? this.world.getPlayer(playerId) : undefined;
      if (
        !root ||
        root.location.kind !== "world" ||
        !player ||
        !isNear(player.position, root.location.position)
      ) {
        this.views.delete(session);
        session.send({
          type: "world-container-closed",
          containerId: view.containerId,
        });
        continue;
      }
      const signature = this.signatureOf(root);
      if (signature === view.signature) continue;
      view.signature = signature;
      this.sendState(session, root);
    }
  }

  private findContainerRoot(position: Position): Item | undefined {
    const mapItems = [...this.world.getMapItems(position)].sort(
      (left, right) => right.stackIndex - left.stackIndex,
    );
    for (const mapItem of mapItems) {
      const root = this.world.getWorldItem(mapItem.instanceId);
      if (
        root &&
        root.location.kind === "world" &&
        (this.catalog.require(root.typeId).containerCapacity ?? 0) > 0
      ) {
        return root;
      }
    }
    return undefined;
  }

  private directChildren(root: Item): Item[] {
    return this.world
      .getWorldSubtree(root.id)
      .filter(
        (item) =>
          (item.location.kind === "corpse" ||
            item.location.kind === "container") &&
          item.location.containerId === root.id,
      );
  }

  private signatureOf(root: Item): string {
    const children = this.directChildren(root)
      .map((item) => `${item.id}:${item.version}:${item.count}`)
      .sort()
      .join(",");
    return `${root.version}|${children}`;
  }

  private sendState(session: Session, root: Item): void {
    if (root.location.kind !== "world") return;
    session.send({
      type: "world-container-state",
      position: root.location.position,
      state: projectWorldContainer(
        root,
        this.directChildren(root),
        this.catalog,
      ),
    });
  }
}
