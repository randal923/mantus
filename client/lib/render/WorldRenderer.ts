import { Application, Container, Sprite } from "pixi.js";
import type { MapState, PlayerState, ServerMessage } from "@tibia/protocol";
import { AssetStore, type OutfitColors, type TibiaObject } from "./AssetStore";
import { PlayerView } from "./PlayerView";
import { SPRITE_IDS } from "./spriteIds";

const TILE = 32;
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
  private readonly groundLayer = new Container();
  private readonly objectLayer = new Container();
  private readonly overlay = new Container();
  private readonly playerViews = new Map<string, PlayerView>();
  private ownPlayerId = "";
  private mapCenter = { x: 0, y: 0 };
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
    await this.store.preload(this.spriteIdsToPreload());
    if (this.destroyed) return;

    this.world.scale.set(ZOOM);
    this.objectLayer.sortableChildren = true;
    this.world.addChild(this.groundLayer, this.objectLayer);
    this.app.stage.addChild(this.world, this.overlay);
    this.app.ticker.add(() => this.tick(this.app.ticker.deltaMS));
  }

  applyMessage(message: ServerMessage): void {
    if (this.destroyed) return;
    switch (message.type) {
      case "welcome":
        this.ownPlayerId = message.playerId;
        this.drawMap(message.map);
        for (const player of message.players) this.addPlayer(player);
        return;
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
        return;
      case "error":
        return;
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.app.renderer) this.app.destroy(true, { children: true });
  }

  private spriteIdsToPreload(): number[] {
    const objects = [
      this.store.item(SPRITE_IDS.grass),
      this.store.item(SPRITE_IDS.grassFlowersA),
      this.store.item(SPRITE_IDS.grassFlowersB),
      ...SPRITE_IDS.trees.map((id) => this.store.item(id)),
      this.store.outfit(SPRITE_IDS.citizenOutfit),
    ];
    return objects.flatMap((o) => o.sprites);
  }

  private drawMap(map: MapState): void {
    this.mapCenter = {
      x: (map.width * TILE) / 2,
      y: (map.height * TILE) / 2,
    };
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        this.drawGround(this.groundTileId(x, y), x, y);
      }
    }
    for (const [x, y] of map.blocked) {
      const treeId =
        SPRITE_IDS.trees[(x * 7 + y * 13) % SPRITE_IDS.trees.length] ??
        SPRITE_IDS.trees[0];
      this.drawBlockingItem(this.store.item(treeId), x, y);
    }
  }

  private groundTileId(x: number, y: number): number {
    const roll = (x * 31 + y * 17) % 19;
    if (roll === 3) return SPRITE_IDS.grassFlowersA;
    if (roll === 11) return SPRITE_IDS.grassFlowersB;
    return SPRITE_IDS.grass;
  }

  private drawGround(itemId: number, tileX: number, tileY: number): void {
    const o = this.store.item(itemId);
    const spriteId = this.store.spriteId(o, { x: tileX, y: tileY });
    if (!spriteId) return;
    const sprite = new Sprite(this.store.spriteTexture(spriteId));
    sprite.position.set(tileX * TILE, tileY * TILE);
    this.groundLayer.addChild(sprite);
  }

  private drawBlockingItem(o: TibiaObject, tileX: number, tileY: number): void {
    for (let h = 0; h < o.height; h++) {
      for (let w = 0; w < o.width; w++) {
        const spriteId = this.store.spriteId(o, { w, h });
        if (!spriteId) continue;
        const sprite = new Sprite(this.store.spriteTexture(spriteId));
        sprite.position.set((tileX - w) * TILE, (tileY - h) * TILE);
        sprite.zIndex = tileY * 16 + 2;
        this.objectLayer.addChild(sprite);
      }
    }
  }

  private addPlayer(player: PlayerState): void {
    if (this.playerViews.has(player.id)) return;
    const view = new PlayerView(
      this.store,
      this.store.outfit(SPRITE_IDS.citizenOutfit),
      player,
      this.outfitColorsFor(player.id),
      NAME_COLOR,
    );
    this.objectLayer.addChild(view.container);
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
      view.container.zIndex = (pos.y / TILE) * 16 + 3;
    }

    const focus =
      this.playerViews.get(this.ownPlayerId)?.pixelPosition() ?? this.mapCenter;
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
