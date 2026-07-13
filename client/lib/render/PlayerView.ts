import { Container, Sprite, Text, Texture } from "pixi.js";
import { GAME_RULES, type Direction, type PlayerState } from "@tibia/protocol";
import type { AssetStore, OutfitColors, TibiaObject } from "./AssetStore";

const TILE = 32;
/** Visual walk duration; matches the server's step cooldown so steps chain smoothly. */
const STEP_MS = GAME_RULES.stepCooldownMs;

const DIR_INDEX: Record<Direction, number> = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
};

/**
 * One player's sprite: bakes colorized outfit frames, interpolates between
 * the tile positions the server announces, and animates the walk cycle.
 * Holds no game rules — it only displays server state.
 */
export class PlayerView {
  readonly container = new Container();
  readonly plate: Text;

  private readonly sprite = new Sprite();
  private readonly frames = new Map<string, Texture>();
  private direction: Direction;
  private tileX: number;
  private tileY: number;
  private fromX: number;
  private fromY: number;
  private moveT = 1;
  private walkDist = 0;

  constructor(
    private readonly store: AssetStore,
    private readonly outfit: TibiaObject,
    state: PlayerState,
    private readonly colors: OutfitColors,
    nameColor: number,
  ) {
    this.direction = state.direction;
    this.tileX = state.x;
    this.tileY = state.y;
    this.fromX = state.x;
    this.fromY = state.y;

    // outfits anchor bottom-right and draw displaced 8px up-left
    this.sprite.position.set(
      -(outfit.width - 1) * TILE - 8,
      -(outfit.height - 1) * TILE - 8,
    );
    this.container.addChild(this.sprite);

    this.plate = new Text({
      text: state.name,
      style: {
        fontFamily: "Verdana, sans-serif",
        fontSize: 11,
        fontWeight: "bold",
        fill: nameColor,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.plate.resolution = 2;
    this.plate.anchor.set(0.5, 1);
    this.updateFrame();
  }

  /** Server said the player is now at (x, y) facing `direction`. */
  applyMove(x: number, y: number, direction: Direction): void {
    this.direction = direction;
    if (x === this.tileX && y === this.tileY) {
      this.updateFrame();
      return;
    }
    // animate strictly tile-to-tile: finish the previous step, then walk the
    // new one. Anything farther than one tile is a server correction — snap.
    const adjacent = Math.abs(x - this.tileX) + Math.abs(y - this.tileY) === 1;
    this.fromX = adjacent ? this.tileX : x;
    this.fromY = adjacent ? this.tileY : y;
    this.tileX = x;
    this.tileY = y;
    this.moveT = adjacent ? 0 : 1;
    this.updateFrame();
  }

  tick(dtMs: number): void {
    if (this.moveT >= 1) {
      if (this.walkDist !== 0) {
        this.walkDist = 0;
        this.updateFrame();
      }
      return;
    }
    this.moveT = Math.min(1, this.moveT + dtMs / STEP_MS);
    this.walkDist += (dtMs / STEP_MS) * TILE;
    this.updateFrame();
  }

  pixelPosition(): { x: number; y: number } {
    const t = this.moveT;
    return {
      x: (this.fromX + (this.tileX - this.fromX) * t) * TILE,
      y: (this.fromY + (this.tileY - this.fromY) * t) * TILE,
    };
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.plate.destroy();
  }

  private updateFrame(): void {
    const walkPhases = this.outfit.phases - 1;
    const moving = this.moveT < 1;
    const phase =
      moving && walkPhases > 0
        ? 1 + (Math.floor(this.walkDist / 8) % walkPhases)
        : 0;
    const dir = DIR_INDEX[this.direction];
    const key = `${dir}:${phase}`;
    let texture = this.frames.get(key);
    if (!texture) {
      texture = this.store.frameTexture(
        this.outfit,
        { x: dir, phase },
        this.colors,
      );
      this.frames.set(key, texture);
    }
    this.sprite.texture = texture;
  }
}
