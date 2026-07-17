import { Application, Container } from "pixi.js";
import {
  CHARACTER_OUTFIT_LOOK_TYPES,
  type CreatureOutfit,
  type CreatureState,
  type Direction,
  type MapItemState,
  type Position,
  type ServerMessage,
  type ViewRange,
} from "@tibia/protocol";
import { AssetStore, type OutfitColors } from "./AssetStore";
import { getCreatureSortPosition } from "./getCreatureSortPosition";
import { getAutoWalkDirections } from "../movement/getAutoWalkDirections";
import { getMapObjectZ } from "./getMapObjectZ";
import { getMapPointerPosition } from "./getMapPointerPosition";
import { getViewportRange } from "./getViewportRange";
import { MapView } from "./MapView";
import { MAP_DEPTH } from "./mapDepth";
import { CreatureView } from "./CreatureView";
import { CombatEffectRenderer } from "./CombatEffectRenderer";
import { TILE_SIZE } from "./tileSize";

const ZOOM = 3;
const NAME_COLORS: Record<CreatureState["kind"], number> = {
  player: 0x44dd44,
  monster: 0xff7777,
  npc: 0x66ccff,
};

interface WorldRendererActions {
  useMap(position: Position): void;
  attackTarget(creatureId: string): void;
  cancelAttack(): void;
  pickupMapItem(item: MapItemState, position: Position): void;
  beginMapItemDrag(item: MapItemState, position: Position): void;
  endItemDrag(): void;
  dropDraggedItem(position: Position): void;
  autoWalk(directions: ReadonlyArray<Direction>): void;
  targetPosition(position: Position): void;
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
  private readonly combatEffects = new CombatEffectRenderer(
    this.store,
    this.mapView,
  );
  private readonly creatureViews = new Map<string, CreatureView>();
  private readonly pendingCreatures = new Map<string, CreatureState>();
  private readonly loadingCreatureIds = new Set<string>();
  private ownPlayerId = "";
  private ownPosition: Position | null = null;
  private attackTargetId: string | null = null;
  private cameraFallback = { x: 0, y: 0 };
  private mapDragCandidate: {
    item: MapItemState;
    position: Position;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null = null;
  private mapDragIcon: HTMLCanvasElement | null = null;
  private previousBodyCursor = "";
  private suppressNextMapClick = false;
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
    this.app.canvas.addEventListener("pointerdown", this.onMapPointerDown);
    window.addEventListener("pointermove", this.onMapPointerMove);
    window.addEventListener("pointerup", this.onMapPointerUp);
    window.addEventListener("pointercancel", this.onMapPointerCancel);
    this.app.canvas.addEventListener("dragover", this.onMapDragOver);
    this.app.canvas.addEventListener("drop", this.onMapDrop);
    this.app.canvas.addEventListener("click", this.onMapClick);
    this.app.canvas.addEventListener("dblclick", this.onMapDoubleClick);
    this.app.canvas.addEventListener("contextmenu", this.onMapContextMenu);

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
      case "attack-target-changed":
        this.applyAttackTarget(message.creatureId);
        return;
      case "creature-health":
        this.applyCreatureHealth(message.creatureId, message.healthPercent);
        return;
      case "creature-state-changed":
        this.replaceCreature(message.creature);
        return;
      case "combat-text":
        this.combatEffects.showCombatText(
          message.position,
          message.value,
          message.damageType,
          message.block,
        );
        return;
      case "magic-effect":
        this.combatEffects.showMagicEffect(
          message.position,
          message.effectId,
        );
        return;
      case "distance-missile":
        this.combatEffects.showMissile(
          message.from,
          message.to,
          message.missileId,
          message.durationMs,
        );
        return;
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

  previewMapItemRemoval(position: Position, instanceId: string): void {
    if (this.destroyed) return;
    this.mapView.previewMapItemRemoval(position, instanceId);
  }

  previewMapItemAddition(
    position: Position,
    item: Omit<MapItemState, "stackIndex">,
  ): void {
    if (this.destroyed) return;
    void this.mapView.previewMapItemAddition(position, item);
  }

  clearMapItemPreviews(): void {
    if (this.destroyed) return;
    this.mapView.clearMapItemPreviews();
  }

  destroy(): void {
    this.destroyed = true;
    this.hideMapDragIcon();
    this.app.canvas.removeEventListener("pointerdown", this.onMapPointerDown);
    window.removeEventListener("pointermove", this.onMapPointerMove);
    window.removeEventListener("pointerup", this.onMapPointerUp);
    window.removeEventListener("pointercancel", this.onMapPointerCancel);
    this.app.canvas.removeEventListener("dragover", this.onMapDragOver);
    this.app.canvas.removeEventListener("drop", this.onMapDrop);
    this.app.canvas.removeEventListener("click", this.onMapClick);
    this.app.canvas.removeEventListener("dblclick", this.onMapDoubleClick);
    this.app.canvas.removeEventListener("contextmenu", this.onMapContextMenu);
    this.combatEffects.destroy();
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
      view.setAttackTarget(creature.id === this.attackTargetId);
      this.pendingCreatures.delete(creature.id);
    } finally {
      this.loadingCreatureIds.delete(creatureId);
    }
  }

  private removeCreature(creatureId: string, clearTarget = true): void {
    this.pendingCreatures.delete(creatureId);
    if (clearTarget && this.attackTargetId === creatureId) {
      this.attackTargetId = null;
    }
    const view = this.creatureViews.get(creatureId);
    if (!view) return;
    view.destroy();
    this.creatureViews.delete(creatureId);
  }

  private replaceCreature(creature: CreatureState): void {
    this.removeCreature(creature.id, false);
    this.addCreature(creature);
  }

  private applyCreatureHealth(
    creatureId: string,
    healthPercent: number | null,
  ): void {
    const view = this.creatureViews.get(creatureId);
    if (view) {
      view.updateHealth(healthPercent);
      return;
    }
    const pending = this.pendingCreatures.get(creatureId);
    if (!pending) return;
    this.pendingCreatures.set(creatureId, { ...pending, healthPercent });
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
    const point = this.canvasPoint(event);
    if (!point) return;
    const position = getMapPointerPosition(
      point.x,
      point.y,
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

  private readonly onMapPointerDown = (event: PointerEvent): void => {
    this.mapDragCandidate = null;
    if (event.button !== 0 || !this.actions || !this.ownPosition) return;
    const position = this.mapPositionForEvent(event);
    if (!position) return;
    const item = this.mapView.topServerItem(position);
    if (!item) return;
    this.mapDragCandidate = {
      item,
      position,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  };

  private readonly onMapPointerMove = (event: PointerEvent): void => {
    const candidate = this.mapDragCandidate;
    if (
      !this.actions ||
      !candidate ||
      candidate.pointerId !== event.pointerId
    ) {
      return;
    }
    if (candidate.active) {
      event.preventDefault();
      this.positionMapDragIcon(event.clientX, event.clientY);
      return;
    }
    if (
      Math.hypot(
        event.clientX - candidate.startX,
        event.clientY - candidate.startY,
      ) < 4
    ) return;
    candidate.active = true;
    event.preventDefault();
    this.actions.beginMapItemDrag(candidate.item, candidate.position);
    this.showMapDragIcon(candidate.item, candidate.position);
    this.positionMapDragIcon(event.clientX, event.clientY);
  };

  private readonly onMapPointerUp = (event: PointerEvent): void => {
    if (this.mapDragCandidate?.pointerId !== event.pointerId) return;
    if (this.mapDragCandidate.active) {
      if (event.target === this.app.canvas) {
        this.suppressNextMapClick = true;
        const position = this.mapPositionForEvent(event);
        if (position) this.actions?.dropDraggedItem(position);
      } else {
        this.suppressNextMapClick = false;
      }
      this.actions?.endItemDrag();
    }
    this.mapDragCandidate = null;
    this.hideMapDragIcon();
  };

  private readonly onMapPointerCancel = (event: PointerEvent): void => {
    if (this.mapDragCandidate?.pointerId !== event.pointerId) return;
    if (this.mapDragCandidate.active) this.actions?.endItemDrag();
    this.mapDragCandidate = null;
    this.hideMapDragIcon();
  };

  private readonly onMapDragOver = (event: DragEvent): void => {
    if (!this.actions) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  };

  private readonly onMapDrop = (event: DragEvent): void => {
    event.preventDefault();
    if (!this.actions) return;
    const position = this.mapPositionForEvent(event);
    if (position) this.actions.dropDraggedItem(position);
  };

  private readonly onMapClick = (event: MouseEvent): void => {
    if (this.suppressNextMapClick) {
      this.suppressNextMapClick = false;
      return;
    }
    if (!this.actions || !this.ownPosition) return;
    const point = this.canvasPoint(event);
    if (!point) return;
    const target = getMapPointerPosition(
      point.x,
      point.y,
      this.world.position.x,
      this.world.position.y,
      ZOOM,
      TILE_SIZE,
      this.ownPosition.z,
    );
    if (event.ctrlKey) {
      this.actions.autoWalk(
        getAutoWalkDirections(this.ownPosition, target),
      );
      return;
    }
    this.actions.targetPosition(target);
  };

  private readonly onMapContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    if (!this.actions || !this.ownPosition) return;
    const point = this.canvasPoint(event);
    if (!point) return;
    const creatureId = this.creatureIdAt(point.x, point.y);
    if (creatureId) {
      if (creatureId === this.attackTargetId) {
        this.actions.cancelAttack();
        return;
      }
      this.actions.attackTarget(creatureId);
      return;
    }
    this.actions.useMap(
      getMapPointerPosition(
        point.x,
        point.y,
        this.world.position.x,
        this.world.position.y,
        ZOOM,
        TILE_SIZE,
        this.ownPosition.z,
      ),
    );
  };

  private canvasPoint(event: MouseEvent): { x: number; y: number } | null {
    const bounds = this.app.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: (event.clientX - bounds.left) * (this.app.screen.width / bounds.width),
      y: (event.clientY - bounds.top) * (this.app.screen.height / bounds.height),
    };
  }

  private mapPositionForEvent(event: MouseEvent): Position | null {
    if (!this.ownPosition) return null;
    const point = this.canvasPoint(event);
    if (!point) return null;
    return getMapPointerPosition(
      point.x,
      point.y,
      this.world.position.x,
      this.world.position.y,
      ZOOM,
      TILE_SIZE,
      this.ownPosition.z,
    );
  }

  private showMapDragIcon(item: MapItemState, position: Position): void {
    this.hideMapDragIcon();
    const icon = this.mapView.createItemDragCanvas(item, position);
    const longestSide = Math.max(icon.width, icon.height);
    icon.style.position = "fixed";
    icon.style.zIndex = "100";
    icon.style.pointerEvents = "none";
    icon.style.imageRendering = "pixelated";
    icon.style.width = `${(icon.width / longestSide) * TILE_SIZE}px`;
    icon.style.height = `${(icon.height / longestSide) * TILE_SIZE}px`;
    icon.setAttribute("aria-hidden", "true");
    document.body.appendChild(icon);
    this.mapDragIcon = icon;
    this.previousBodyCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";
  }

  private positionMapDragIcon(clientX: number, clientY: number): void {
    if (!this.mapDragIcon) return;
    this.mapDragIcon.style.left = `${clientX}px`;
    this.mapDragIcon.style.top = `${clientY}px`;
  }

  private hideMapDragIcon(): void {
    if (!this.mapDragIcon) return;
    this.mapDragIcon.remove();
    this.mapDragIcon = null;
    document.body.style.cursor = this.previousBodyCursor;
    this.previousBodyCursor = "";
  }

  private creatureIdAt(screenX: number, screenY: number): string | null {
    let selected: { id: string; zIndex: number } | null = null;
    for (const [id, view] of this.creatureViews) {
      if (
        id === this.ownPlayerId ||
        !view.containsScreenPoint(screenX, screenY)
      ) {
        continue;
      }
      if (
        !selected ||
        view.container.zIndex > selected.zIndex ||
        (view.container.zIndex === selected.zIndex && id > selected.id)
      ) {
        selected = { id, zIndex: view.container.zIndex };
      }
    }
    return selected?.id ?? null;
  }

  private applyAttackTarget(creatureId: string | null): void {
    if (this.attackTargetId) {
      this.creatureViews.get(this.attackTargetId)?.setAttackTarget(false);
    }
    this.attackTargetId = creatureId;
    if (creatureId) {
      this.creatureViews.get(creatureId)?.setAttackTarget(true);
    }
  }

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
    this.combatEffects.tick(dtMs);
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
