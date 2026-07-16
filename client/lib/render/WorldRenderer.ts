import { Application, Container } from "pixi.js";
import {
  CHARACTER_OUTFIT_LOOK_TYPES,
  type CharacterOutfit,
  type PlayerState,
  type ServerMessage,
  type ViewRange,
} from "@tibia/protocol";
import { AssetStore, type OutfitColors } from "./AssetStore";
import { getCreatureSortPosition } from "./getCreatureSortPosition";
import { getMapObjectZ } from "./getMapObjectZ";
import { getViewportRange } from "./getViewportRange";
import { MapView } from "./MapView";
import { MAP_DEPTH } from "./mapDepth";
import { PlayerView } from "./PlayerView";
import { TILE_SIZE } from "./tileSize";

const ZOOM = 3;
const NAME_COLOR = 0x44dd44;

/**
 * Pure renderer: draws whatever the server says using the Tibia sprite
 * atlas. Holds no game rules — movement, occupancy, and speed all come from
 * server messages.
 */
export class WorldRenderer {
  private readonly app = new Application();
  private readonly store = new AssetStore();
  private readonly world = new Container();
  private readonly overlay = new Container();
  private readonly mapView = new MapView(this.store);
  private readonly playerViews = new Map<string, PlayerView>();
  private ownPlayerId = "";
  private cameraFallback = { x: 0, y: 0 };
  private destroyed = false;

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
        return;
      case "welcome": {
        this.ownPlayerId = message.playerId;
        void this.mapView.setMap(message.map.name);
        for (const player of message.players) this.addPlayer(player);
        const own = message.players.find((p) => p.id === message.playerId);
        if (own) {
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
      case "player-joined":
        this.addPlayer(message.player);
        return;
      case "player-left":
        this.removePlayer(message.playerId);
        return;
      case "player-moved":
        this.applyPlayerMove(
          message.playerId,
          message.position,
          message.direction,
          message.positionRevision,
          message.durationMs,
        );
        return;
      case "position-correction": {
        const view = this.playerViews.get(message.playerId);
        if (!view) return;
        const previousFloor = view.floor;
        view.applyCorrection(
          message.position,
          message.direction,
          message.positionRevision,
        );
        if (view.floor !== previousFloor) {
          this.mapView.creatureLayer(view.floor).addChild(view.container);
        }
        if (message.playerId === this.ownPlayerId)
          this.applyOwnPlayerCenter(message.position);
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
    this.mapView.destroy();
    if (this.app.renderer) this.app.destroy(true, { children: true });
  }

  private addPlayer(player: PlayerState): void {
    if (this.playerViews.has(player.id)) return;
    const view = new PlayerView(
      this.store,
      this.store.outfit(player.outfit.lookType),
      player,
      this.outfitColorsFor(player.outfit),
      NAME_COLOR,
    );
    this.mapView.creatureLayer(player.position.z).addChild(view.container);
    this.overlay.addChild(view.plate);
    this.playerViews.set(player.id, view);
  }

  private removePlayer(playerId: string): void {
    const view = this.playerViews.get(playerId);
    if (!view) return;
    view.destroy();
    this.playerViews.delete(playerId);
  }

  private applyPlayerMove(
    playerId: string,
    position: PlayerState["position"],
    direction: PlayerState["direction"],
    revision: number,
    durationMs: number,
  ): void {
    const view = this.playerViews.get(playerId);
    if (!view) return;
    const previousFloor = view.floor;
    view.applyMove(position, direction, revision, durationMs);
    if (view.floor !== previousFloor) {
      this.mapView.creatureLayer(view.floor).addChild(view.container);
    }
    if (playerId === this.ownPlayerId) this.applyOwnPlayerCenter(position);
  }

  private applyOwnPlayerCenter(position: PlayerState["position"]): void {
    this.cameraFallback = {
      x: position.x * TILE_SIZE,
      y: position.y * TILE_SIZE,
    };
    this.mapView.setCenter(position.x, position.y, position.z);
  }

  private outfitColorsFor(outfit: CharacterOutfit): OutfitColors {
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
    const orderedViews = [...this.playerViews.entries()].sort(([left], [right]) =>
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
