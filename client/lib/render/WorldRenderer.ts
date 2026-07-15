import { Application, Container } from "pixi.js";
import type { PlayerState, ServerMessage } from "@tibia/protocol";
import { AssetStore, type OutfitColors } from "./AssetStore";
import { getMapObjectZ } from "./getMapObjectZ";
import { MapView } from "./MapView";
import { MAP_DEPTH } from "./mapDepth";
import { PlayerView } from "./PlayerView";

const TILE = 32;
const ZOOM = 3;
const NAME_COLOR = 0x44dd44;
const CITIZEN_OUTFIT_ID = 128;

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
    await this.store.preload(this.store.outfit(CITIZEN_OUTFIT_ID).sprites);
    if (this.destroyed) return;

    this.world.scale.set(ZOOM);
    this.world.addChild(this.mapView.container);
    this.app.stage.addChild(this.world, this.overlay);
    this.app.ticker.add(() => this.tick(this.app.ticker.deltaMS));
  }

  applyMessage(message: ServerMessage): void {
    if (this.destroyed) return;
    switch (message.type) {
      case "welcome": {
        this.ownPlayerId = message.playerId;
        void this.mapView.setMap(message.map.name);
        for (const player of message.players) this.addPlayer(player);
        const own = message.players.find((p) => p.id === message.playerId);
        if (own) {
          this.cameraFallback = { x: own.x * TILE, y: own.y * TILE };
          this.mapView.setCenter(own.x, own.y);
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
        this.playerViews
          .get(message.playerId)
          ?.applyMove(message.x, message.y, message.direction);
        if (message.playerId === this.ownPlayerId) {
          this.mapView.setCenter(message.x, message.y);
        }
        return;
      case "error":
        return;
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.app.renderer) this.app.destroy(true, { children: true });
  }

  private addPlayer(player: PlayerState): void {
    if (this.playerViews.has(player.id)) return;
    const view = new PlayerView(
      this.store,
      this.store.outfit(CITIZEN_OUTFIT_ID),
      player,
      this.outfitColorsFor(player.id),
      NAME_COLOR,
    );
    this.mapView.creatureLayer.addChild(view.container);
    this.overlay.addChild(view.plate);
    this.playerViews.set(player.id, view);
  }

  private removePlayer(playerId: string): void {
    const view = this.playerViews.get(playerId);
    if (!view) return;
    view.destroy();
    this.playerViews.delete(playerId);
  }

  /** Deterministic per-player outfit colors so everyone looks distinct. */
  private outfitColorsFor(playerId: string): OutfitColors {
    const palette = this.store.outfitPalette;
    let hash = 0;
    for (const char of playerId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const pick = (salt: number) => {
      let mixed = (hash ^ Math.imul(salt, 0x9e3779b9)) >>> 0;
      mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b) >>> 0;
      return palette[mixed % palette.length] ?? [255, 255, 255];
    };
    return {
      head: pick(1),
      body: pick(2),
      legs: pick(3),
      feet: pick(4),
    };
  }

  private tick(dtMs: number): void {
    for (const view of this.playerViews.values()) {
      view.tick(dtMs);
      const pos = view.pixelPosition();
      view.container.position.set(pos.x, pos.y);
      view.container.zIndex = getMapObjectZ(
        pos.x / TILE,
        pos.y / TILE,
        MAP_DEPTH.creature,
      );
    }

    const focus =
      this.playerViews.get(this.ownPlayerId)?.pixelPosition() ??
      this.cameraFallback;
    const cameraX = Math.round(
      this.app.screen.width / 2 - (focus.x + TILE / 2) * ZOOM,
    );
    const cameraY = Math.round(
      this.app.screen.height / 2 - (focus.y + TILE / 2) * ZOOM,
    );
    this.world.position.set(cameraX, cameraY);

    for (const view of this.playerViews.values()) {
      const pos = view.pixelPosition();
      view.plate.position.set(
        cameraX + (pos.x + TILE / 2 - 8) * ZOOM,
        cameraY + (pos.y - 8) * ZOOM - 26,
      );
    }
  }
}
