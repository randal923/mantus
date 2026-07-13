import { Application, Container, Graphics, Text } from "pixi.js";
import type { MapState, PlayerState, ServerMessage } from "@tibia/protocol";

const TILE = 32;
const ZOOM = 2;

interface PlayerView {
  container: Container;
  body: Graphics;
}

/**
 * Pure renderer: draws whatever the server says, holds no game rules.
 */
export class WorldRenderer {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly playerViews = new Map<string, PlayerView>();
  private ownPlayerId = "";
  private destroyed = false;

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: host, background: "#101014" });
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    host.appendChild(this.app.canvas);
    this.world.scale.set(ZOOM);
    this.app.stage.addChild(this.world);
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
        this.movePlayer(message.playerId, message.x, message.y);
        return;
      case "error":
        return;
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.app.renderer) this.app.destroy(true, { children: true });
  }

  private drawMap(map: MapState): void {
    const grid = new Graphics();
    grid
      .rect(0, 0, map.width * TILE, map.height * TILE)
      .fill(0x1d2b1d)
      .stroke({ color: 0x3a3a3a, width: 2 });
    for (let x = 1; x < map.width; x++) {
      grid.moveTo(x * TILE, 0).lineTo(x * TILE, map.height * TILE);
    }
    for (let y = 1; y < map.height; y++) {
      grid.moveTo(0, y * TILE).lineTo(map.width * TILE, y * TILE);
    }
    grid.stroke({ color: 0x28321f, width: 1 });
    for (const [x, y] of map.blocked) {
      grid
        .rect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4)
        .fill(0x555b60);
    }
    this.world.addChildAt(grid, 0);
    this.centerWorld(map);
  }

  private centerWorld(map: MapState): void {
    const { width, height } = this.app.screen;
    this.world.position.set(
      Math.round((width - map.width * TILE * ZOOM) / 2),
      Math.round((height - map.height * TILE * ZOOM) / 2),
    );
  }

  private addPlayer(player: PlayerState): void {
    if (this.playerViews.has(player.id)) return;
    const container = new Container();
    const isOwn = player.id === this.ownPlayerId;
    const body = new Graphics();
    body
      .rect(4, 4, TILE - 8, TILE - 8)
      .fill(isOwn ? 0x3fae4a : 0xc98a3b)
      .stroke({ color: 0x000000, width: 1 });
    const label = new Text({
      text: player.name,
      style: {
        fontFamily: "Verdana, sans-serif",
        fontSize: 9,
        fontWeight: "bold",
        fill: isOwn ? 0x66ff66 : 0xffcc88,
        stroke: { color: 0x000000, width: 2 },
      },
    });
    label.resolution = 2;
    label.anchor.set(0.5, 1);
    label.position.set(TILE / 2, 2);
    container.addChild(body, label);
    container.position.set(player.x * TILE, player.y * TILE);
    this.world.addChild(container);
    this.playerViews.set(player.id, { container, body });
  }

  private removePlayer(playerId: string): void {
    const view = this.playerViews.get(playerId);
    if (!view) return;
    view.container.destroy({ children: true });
    this.playerViews.delete(playerId);
  }

  private movePlayer(playerId: string, x: number, y: number): void {
    const view = this.playerViews.get(playerId);
    if (!view) return;
    view.container.position.set(x * TILE, y * TILE);
  }
}
