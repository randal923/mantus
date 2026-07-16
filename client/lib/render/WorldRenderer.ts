import { Application, Container } from "pixi.js";
import {
  CHARACTER_OUTFIT_LOOK_TYPES,
  type CreatureOutfit,
  type CreatureState,
  type MapItemState,
  type Position,
  type ServerMessage,
  type ViewRange,
} from "@tibia/protocol";
import { AssetStore, type OutfitColors } from "./AssetStore";
import { getCreatureSortPosition } from "./getCreatureSortPosition";
import { getMapObjectZ } from "./getMapObjectZ";
import { getMapPointerPosition } from "./getMapPointerPosition";
import { getViewportRange } from "./getViewportRange";
import { MapView } from "./MapView";
import { MAP_DEPTH } from "./mapDepth";
import { CreatureView } from "./CreatureView";
import { TILE_SIZE } from "./tileSize";

const ZOOM = 3;
const NAME_COLORS: Record<CreatureState["kind"], number> = {
  player: 0x44dd44,
  monster: 0xff7777,
  npc: 0x66ccff,
};

interface WorldRendererActions {
  useMap(position: Position): void;
  pickupMapItem(item: MapItemState, position: Position): void;
}

/**
 * Draws server state and converts basic pointer gestures into intent targets.
 * It holds no gameplay rules; the server validates every resulting action.
 */
export class WorldRenderer {
  private readonly app = new Application();
  private readonly store = new AssetStore();
  private readonly world = new Container();
  private readonly overlay = new Container();
  private readonly mapView = new MapView(this.store);
  private readonly creatureViews = new Map<string, CreatureView>();
  private readonly pendingCreatures = new Map<string, CreatureState>();
  private readonly loadingCreatureIds = new Set<string>();
  private ownPlayerId = "";
  private ownPosition: Position | null = null;
  private cameraFallback = { x: 0, y: 0 };
  private destroyed = false;

  constructor(private readonly actions?: WorldRendererActions) {}

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: "#101014",
      antialias: false,
    });
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    host.appendChild(this.app.canvas);
    this.app.canvas.addEventListener("dblclick", this.onMapDoubleClick);

    await this.store.load();
    if (this.destroyed) return;
    for (const lookType of CHARACTER_OUTFIT_LOOK_TYPES) {
      await this.store.preload(this.store.outfit(lookType).sprites);
    }
    if (this.destroyed) return;

    this.world.scale.set(ZOOM);
    this.overlay.sortableChildren = true;
    this.world.addChild(this.mapView.container);
    this.app.stage.addChild(this.world, this.overlay);
    this.app.ticker.add(() => this.tick(this.app.ticker.deltaMS));
  }

  applyMessage(message: ServerMessage): void {
    if (this.destroyed) return;
    switch (message.type) {
      case "character-list":
      case "inventory-updated":
        return;
      case "welcome": {
        this.ownPlayerId = message.playerId;
        void this.mapView.setMap(message.map.name);
        for (const creature of message.creatures) this.addCreature(creature);
        const own = message.creatures.find(
          (creature) => creature.id === message.playerId,
        );
        if (own) {
          this.ownPosition = { ...own.position };
          this.cameraFallback = {
            x: own.position.x * TILE_SIZE,
            y: own.position.y * TILE_SIZE,
          };
          this.mapView.setCenter(
            own.position.x,
            own.position.y,
            own.position.z,
          );
        }
        return;
      }
      case "creature-joined":
        this.addCreature(message.creature);
        return;
      case "creature-left":
        this.removeCreature(message.creatureId);
        return;
      case "creature-moved":
        this.applyCreatureMove(
          message.creatureId,
          message.position,
          message.direction,
          message.positionRevision,
          message.durationMs,
        );
        return;
      case "position-correction": {
        const view = this.creatureViews.get(message.playerId);
        if (!view) {
          this.updatePendingCreature(
            message.playerId,
            message.position,
            message.direction,
            message.positionRevision,
          );
          if (message.playerId === this.ownPlayerId) {
            this.ownPosition = { ...message.position };
            this.applyOwnPlayerCenter(message.position);
          }
          return;
        }
        const previousFloor = view.floor;
        view.applyCorrection(
          message.position,
          message.direction,
          message.positionRevision,
        );
        if (view.floor !== previousFloor) {
          this.mapView.creatureLayer(view.floor).addChild(view.container);
        }
        if (message.playerId === this.ownPlayerId) {
          this.ownPosition = { ...message.position };
          this.applyOwnPlayerCenter(message.position);
        }
        return;
      }
      case "tile-states":
        void this.mapView.applyTileStates(message.visible, message.hidden);
        return;
      case "error":
        return;
    }
  }

  setViewportSize(width: number, height: number): ViewRange {
    const range = getViewportRange(width, height, TILE_SIZE * ZOOM);
    this.mapView.setViewRange(range);
    return range;
  }

  destroy(): void {
    this.destroyed = true;
    this.app.canvas.removeEventListener("dblclick", this.onMapDoubleClick);
    this.mapView.destroy();
    if (this.app.renderer) this.app.destroy(true, { children: true });
  }

  private addCreature(creature: CreatureState): void {
    if (this.creatureViews.has(creature.id)) return;
    this.pendingCreatures.set(creature.id, creature);
    if (this.loadingCreatureIds.has(creature.id)) return;
    this.loadingCreatureIds.add(creature.id);
    void this.loadCreature(creature.id, creature.outfit).catch(
      (cause: unknown) => {
        this.pendingCreatures.delete(creature.id);
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`failed to render creature ${creature.id}: ${reason}`);
      },
    );
  }

  private async loadCreature(
    creatureId: string,
    appearance: CreatureOutfit,
  ): Promise<void> {
    try {
      const object = appearance.lookTypeEx
        ? this.store.item(appearance.lookTypeEx)
        : appearance.lookType > 0
          ? this.store.outfit(appearance.lookType)
          : null;
      if (object) await this.store.preload(object.sprites);
      if (this.destroyed || this.creatureViews.has(creatureId)) return;
      const creature = this.pendingCreatures.get(creatureId);
      if (!creature) return;
      const view = new CreatureView(
        this.store,
        object,
        creature,
        object?.category === "outfit"
          ? this.outfitColorsFor(creature.outfit)
          : undefined,
        NAME_COLORS[creature.kind],
      );
      this.mapView.creatureLayer(creature.position.z).addChild(view.container);
      this.overlay.addChild(view.plate);
      this.creatureViews.set(creature.id, view);
      this.pendingCreatures.delete(creature.id);
    } finally {
      this.loadingCreatureIds.delete(creatureId);
    }
  }

  private removeCreature(creatureId: string): void {
    this.pendingCreatures.delete(creatureId);
    const view = this.creatureViews.get(creatureId);
    if (!view) return;
    view.destroy();
    this.creatureViews.delete(creatureId);
  }

  private applyCreatureMove(
    creatureId: string,
    position: CreatureState["position"],
    direction: CreatureState["direction"],
    revision: number,
    durationMs: number,
  ): void {
    const view = this.creatureViews.get(creatureId);
    if (!view) {
      this.updatePendingCreature(creatureId, position, direction, revision);
      if (creatureId === this.ownPlayerId) {
        this.ownPosition = { ...position };
        this.applyOwnPlayerCenter(position);
      }
      return;
    }
    const previousFloor = view.floor;
    view.applyMove(position, direction, revision, durationMs);
    if (view.floor !== previousFloor) {
      this.mapView.creatureLayer(view.floor).addChild(view.container);
    }
    if (creatureId === this.ownPlayerId) {
      this.ownPosition = { ...position };
      this.applyOwnPlayerCenter(position);
    }
  }

  private readonly onMapDoubleClick = (event: MouseEvent): void => {
    if (!this.actions || !this.ownPosition) return;
    const bounds = this.app.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const position = getMapPointerPosition(
      (event.clientX - bounds.left) * (this.app.screen.width / bounds.width),
      (event.clientY - bounds.top) * (this.app.screen.height / bounds.height),
      this.world.position.x,
      this.world.position.y,
      ZOOM,
      TILE_SIZE,
      this.ownPosition.z,
    );
    if (event.shiftKey) {
      const item = this.mapView.topServerItem(position);
      if (item) this.actions.pickupMapItem(item, position);
      return;
    }
    this.actions.useMap(position);
  };

  private updatePendingCreature(
    creatureId: string,
    position: CreatureState["position"],
    direction: CreatureState["direction"],
    revision: number,
  ): void {
    const current = this.pendingCreatures.get(creatureId);
    if (!current || revision < current.positionRevision) return;
    this.pendingCreatures.set(creatureId, {
      ...current,
      position: { ...position },
      direction,
      positionRevision: revision,
    });
  }

  private applyOwnPlayerCenter(position: CreatureState["position"]): void {
    this.cameraFallback = {
      x: position.x * TILE_SIZE,
      y: position.y * TILE_SIZE,
    };
    this.mapView.setCenter(position.x, position.y, position.z);
  }

  private outfitColorsFor(outfit: CreatureOutfit): OutfitColors {
    const palette = this.store.outfitPalette;
    return {
      head: palette[outfit.head] ?? [255, 255, 255],
      body: palette[outfit.body] ?? [255, 255, 255],
      legs: palette[outfit.legs] ?? [255, 255, 255],
      feet: palette[outfit.feet] ?? [255, 255, 255],
    };
  }

  private tick(dtMs: number): void {
    this.mapView.tick(dtMs);
    const orderedViews = [...this.creatureViews.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const visualPositions = new Map<string, { x: number; y: number }>();
    for (let index = 0; index < orderedViews.length; index++) {
      const [id, view] = orderedViews[index];
      view.tick(dtMs);
      const position = view.pixelPosition();
      const elevation = this.mapView.elevationAt(
        view.floor,
        position.x / TILE_SIZE,
        position.y / TILE_SIZE,
      );
      const visual = view.visualPosition(elevation);
      visualPositions.set(id, visual);
      view.container.position.set(visual.x, visual.y);
      const creatureOrder =
        ((index + 1) * (MAP_DEPTH.effect - MAP_DEPTH.creature)) /
        (orderedViews.length + 1);
      const sortPosition = getCreatureSortPosition(
        position.x / TILE_SIZE,
        position.y / TILE_SIZE,
      );
      view.container.zIndex = getMapObjectZ(
        sortPosition.x,
        sortPosition.y,
        MAP_DEPTH.creature + creatureOrder,
      );
      view.container.visible = this.mapView.isDynamicFloorVisible(view.floor);
    }

    const focus =
      visualPositions.get(this.ownPlayerId) ??
      this.cameraFallback;
    const cameraX = Math.round(
      this.app.screen.width / 2 - (focus.x + TILE_SIZE / 2) * ZOOM,
    );
    const cameraY = Math.round(
      this.app.screen.height / 2 - (focus.y + TILE_SIZE / 2) * ZOOM,
    );
    this.world.position.set(cameraX, cameraY);

    for (const [id, view] of orderedViews) {
      const visual = visualPositions.get(id);
      if (!visual) continue;
      const projected = this.mapView.projectPosition(
        visual.x,
        visual.y,
        view.floor,
      );
      view.plate.position.set(
        cameraX + (projected.x + TILE_SIZE / 2 - 8) * ZOOM,
        cameraY + (projected.y - 8) * ZOOM - 26,
      );
      view.plate.visible = this.mapView.isDynamicFloorVisible(view.floor);
      view.plate.zIndex = view.container.zIndex;
    }
  }
}
