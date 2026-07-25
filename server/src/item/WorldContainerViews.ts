import type { Position } from "@tibia/protocol";
import type { Session } from "../Session";
import type { World } from "../World";
import { isNear } from "./isNear";
import type { Item } from "./Item";
import type { ItemCatalog } from "./ItemCatalog";
import { materializeWorldSource } from "./plan/materializeWorldSource";
import { projectWorldContainer } from "./projectWorldContainer";

interface WorldContainerView {
  /** The world-located root the view hangs off; reach is checked against it. */
  readonly rootId: string;
  readonly containerId: string;
  readonly parentContainerId: string | null;
  signature: string;
}

/**
 * Per-session views into world containers (corpses, chests, and containers
 * nested inside them). A session may hold several at once, bounded so one
 * connection cannot accumulate views without limit (charter rule 10).
 *
 * Contents are re-validated and reconciled every tick so any mutation source
 * (loot, decay, another player) reaches every viewer, and a view auto-closes
 * when its container leaves the root's subtree, the root disappears, or the
 * player steps out of reach.
 */
export class WorldContainerViews {
  private readonly views = new Map<Session, WorldContainerView[]>();

  constructor(
    private readonly world: World,
    private readonly catalog: ItemCatalog,
    private readonly maxViewsPerSession = 8,
  ) {}

  /**
   * Handles use-map on a tile holding a world container. Returns true when the
   * tile was handled (opened or rejected), false to let the intent fall
   * through to map transitions.
   */
  open(session: Session, position: Position): boolean {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    if (!playerId || !player) return false;
    if (!this.tileHasContainer(position)) return false;
    if (!isNear(player.position, position)) {
      session.sendError("item-action-failed");
      return true;
    }
    // Materializing only after the reach check keeps a pristine chest
    // untouched until someone who may open it actually does.
    const root = this.findContainerRoot(position);
    if (!root) return false;
    if (!this.mayOpen(root, playerId)) {
      session.sendError("loot-protected");
      return true;
    }
    this.addView(session, {
      rootId: root.id,
      containerId: root.id,
      parentContainerId: null,
      signature: "",
    });
    return true;
  }

  /**
   * Opens a container nested inside a view this session already holds. The id
   * is re-resolved against live world state at execution time (charter rule
   * 4): it must still be inside the root's subtree, still be a container, and
   * still be in reach.
   */
  openChild(session: Session, containerId: string, revision: number): void {
    const playerId = session.playerId;
    const player = playerId ? this.world.getPlayer(playerId) : undefined;
    const open = this.views.get(session) ?? [];
    const container = this.world.getWorldItem(containerId);
    if (!playerId || !player || !container || container.version !== revision) {
      session.sendError("item-action-failed");
      return;
    }
    const parent = container.location;
    if (parent.kind !== "corpse" && parent.kind !== "container") {
      session.sendError("item-action-failed");
      return;
    }
    const host = open.find((view) =>
      this.world
        .getWorldSubtree(view.rootId)
        .some((item) => item.id === container.id),
    );
    const root = host ? this.world.getWorldItem(host.rootId) : undefined;
    if (
      !host ||
      !root ||
      root.location.kind !== "world" ||
      !isNear(player.position, root.location.position) ||
      (this.catalog.require(container.typeId).containerCapacity ?? 0) < 1
    ) {
      session.sendError("item-action-failed");
      return;
    }
    if (!this.mayOpen(root, playerId)) {
      session.sendError("loot-protected");
      return;
    }
    this.addView(session, {
      rootId: host.rootId,
      containerId: container.id,
      parentContainerId: parent.containerId,
      signature: "",
    });
  }

  close(session: Session, containerId: string): void {
    const open = this.views.get(session);
    if (!open) return;
    const closing = open.filter(
      (view) =>
        view.containerId === containerId ||
        this.descendsFrom(open, view, containerId),
    );
    if (closing.length === 0) return;
    const remaining = open.filter((view) => !closing.includes(view));
    if (remaining.length > 0) this.views.set(session, remaining);
    else this.views.delete(session);
    for (const view of closing) {
      session.send({
        type: "world-container-closed",
        containerId: view.containerId,
      });
    }
  }

  has(session: Session, containerId: string): boolean {
    return this.rootFor(session, containerId) !== undefined;
  }

  /** The world root of an open view, which is what the loot plans work from. */
  rootFor(session: Session, containerId: string): string | undefined {
    return (this.views.get(session) ?? []).find(
      (view) => view.containerId === containerId,
    )?.rootId;
  }

  /** The direct children of an open view, in slot order. */
  contents(session: Session, containerId: string): ReadonlyArray<Item> {
    const view = (this.views.get(session) ?? []).find(
      (candidate) => candidate.containerId === containerId,
    );
    if (!view) return [];
    const container = this.world.getWorldItem(view.containerId);
    return container ? this.directChildren(view.rootId, container) : [];
  }

  detach(session: Session): void {
    this.views.delete(session);
  }

  /** Revalidates every view and pushes content changes to its viewer. */
  tick(): void {
    for (const [session, open] of this.views) {
      const playerId = session.playerId;
      const player = playerId ? this.world.getPlayer(playerId) : undefined;
      const surviving: WorldContainerView[] = [];
      for (const view of open) {
        const root = this.world.getWorldItem(view.rootId);
        const container =
          view.containerId === view.rootId
            ? root
            : this.world.getWorldItem(view.containerId);
        if (
          !root ||
          !container ||
          root.location.kind !== "world" ||
          !player ||
          !isNear(player.position, root.location.position) ||
          (container !== root &&
            !this.world
              .getWorldSubtree(root.id)
              .some((item) => item.id === container.id))
        ) {
          session.send({
            type: "world-container-closed",
            containerId: view.containerId,
          });
          continue;
        }
        surviving.push(view);
        const signature = this.signatureOf(view.rootId, container);
        if (signature === view.signature) continue;
        view.signature = signature;
        this.sendState(session, root, view, container);
      }
      if (surviving.length > 0) this.views.set(session, surviving);
      else this.views.delete(session);
    }
  }

  /** Loot protection is the root's: a bag inside a corpse inherits it. */
  private mayOpen(root: Item, playerId: string): boolean {
    const owner = root.attributes.ownerCharacterId;
    return typeof owner !== "string" || owner === playerId;
  }

  private addView(session: Session, view: WorldContainerView): void {
    const open = this.views.get(session) ?? [];
    const existing = open.find(
      (candidate) => candidate.containerId === view.containerId,
    );
    const root = this.world.getWorldItem(view.rootId);
    const container = this.world.getWorldItem(view.containerId);
    if (!root || !container) return;
    if (existing) {
      existing.signature = this.signatureOf(view.rootId, container);
      this.sendState(session, root, existing, container);
      return;
    }
    // Oldest view first: a session that keeps opening containers drops its
    // stalest view rather than growing without bound.
    while (open.length >= this.maxViewsPerSession) {
      const evicted = open.shift();
      if (!evicted) break;
      session.send({
        type: "world-container-closed",
        containerId: evicted.containerId,
      });
    }
    view.signature = this.signatureOf(view.rootId, container);
    open.push(view);
    this.views.set(session, open);
    this.sendState(session, root, view, container);
  }

  private descendsFrom(
    open: ReadonlyArray<WorldContainerView>,
    view: WorldContainerView,
    ancestorId: string,
  ): boolean {
    let current: WorldContainerView | undefined = view;
    const seen = new Set<string>();
    while (current?.parentContainerId) {
      if (current.parentContainerId === ancestorId) return true;
      if (seen.has(current.containerId)) return false;
      seen.add(current.containerId);
      const parentId: string = current.parentContainerId;
      current = open.find((candidate) => candidate.containerId === parentId);
    }
    return false;
  }

  private tileHasContainer(position: Position): boolean {
    return this.world
      .getMapItems(position)
      .some(
        (mapItem) =>
          (this.catalog.get(
            this.world.getWorldItem(mapItem.instanceId)?.typeId ??
              mapItem.itemId,
          )?.containerCapacity ?? 0) > 0,
      );
  }

  /**
   * The topmost container on the tile. A pristine map chest has no rows and no
   * memory state yet, so it is materialized here — memory-first, exactly like
   * a corpse: no row exists until a player takes something out of it, and the
   * contents already taken (their seed keys are hidden) are not re-created.
   */
  private findContainerRoot(position: Position): Item | undefined {
    const mapItems = [...this.world.getMapItems(position)].sort(
      (left, right) => right.stackIndex - left.stackIndex,
    );
    for (const mapItem of mapItems) {
      const root = this.world.getWorldItem(mapItem.instanceId);
      if (root) {
        if (
          root.location.kind === "world" &&
          (this.catalog.require(root.typeId).containerCapacity ?? 0) > 0
        ) {
          return root;
        }
        continue;
      }
      const source = mapItem.source;
      if (
        !source ||
        source.seedKey !== mapItem.instanceId ||
        (this.catalog.get(source.typeId)?.containerCapacity ?? 0) < 1
      ) {
        continue;
      }
      const pristine = materializeWorldSource(this.catalog, source, (seedKey) =>
        this.world.isSeedHidden(seedKey),
      );
      if (!pristine) continue;
      const items = [pristine.root, ...pristine.contents];
      this.world.applyCreatedWorldItems(items);
      this.world.registerUnpersistedSeedItems(items, pristine.seed);
      return pristine.root;
    }
    return undefined;
  }

  private directChildren(rootId: string, container: Item): Item[] {
    return this.world
      .getWorldSubtree(rootId)
      .filter(
        (item) =>
          (item.location.kind === "corpse" ||
            item.location.kind === "container") &&
          item.location.containerId === container.id,
      );
  }

  private signatureOf(rootId: string, container: Item): string {
    const children = this.directChildren(rootId, container)
      .map((item) => `${item.id}:${item.version}:${item.count}`)
      .sort()
      .join(",");
    return `${container.version}|${children}`;
  }

  private sendState(
    session: Session,
    root: Item,
    view: WorldContainerView,
    container: Item,
  ): void {
    if (root.location.kind !== "world") return;
    session.send({
      type: "world-container-state",
      position: root.location.position,
      state: {
        ...projectWorldContainer(
          container,
          this.directChildren(view.rootId, container),
          this.catalog,
        ),
        parentContainerId: view.parentContainerId,
      },
    });
  }
}
