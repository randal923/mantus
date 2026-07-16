import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { CreatureState, Direction, Position } from "@tibia/protocol";
import type { AssetStore, OutfitColors, TibiaObject } from "./AssetStore";
import { TILE_SIZE } from "./tileSize";

const MIN_FOOT_ANIMATION_DELAY_MS = 20;
const MAX_CLASSIC_FOOT_ANIMATION_DELAY_MS = 205;
const MAX_MULTI_PHASE_FOOT_ANIMATION_DELAY_MS = 80;

const DIR_INDEX: Record<Direction, number> = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
};

/**
 * One creature's sprite: bakes colorized outfit frames, interpolates between
 * the tile positions the server announces, and animates the walk cycle.
 * Holds no game rules — it only displays server state.
 */
export class CreatureView {
  readonly container = new Container();
  readonly plate = new Container();

  private readonly sprite = new Sprite();
  private readonly frames = new Map<string, Texture>();
  private direction: Direction;
  private walkDirection: Direction;
  private tileX: number;
  private tileY: number;
  private tileZ: number;
  private fromX: number;
  private fromY: number;
  private moveT = 1;
  private footAnimationElapsedMs = 0;
  private walkAnimationPhase = 0;
  private stepDurationMs = 1;
  private positionRevision: number;

  constructor(
    private readonly store: AssetStore,
    private readonly outfit: TibiaObject | null,
    state: CreatureState,
    private readonly colors: OutfitColors | undefined,
    nameColor: number,
  ) {
    this.direction = state.direction;
    this.walkDirection = state.direction;
    this.tileX = state.position.x;
    this.tileY = state.position.y;
    this.tileZ = state.position.z;
    this.fromX = state.position.x;
    this.fromY = state.position.y;
    this.positionRevision = state.positionRevision;

    // outfits anchor bottom-right and draw displaced 8px up-left
    if (outfit) {
      this.sprite.position.set(
        -(outfit.width - 1) * TILE_SIZE - 8,
        -(outfit.height - 1) * TILE_SIZE - 8,
      );
    }
    this.container.addChild(this.sprite);

    const name = new Text({
      text: state.name,
      style: {
        fontFamily: "Verdana, sans-serif",
        fontSize: 11,
        fontWeight: "bold",
        fill: nameColor,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    name.resolution = 2;
    name.anchor.set(0.5, 1);
    name.position.y = -5;
    const health = new Graphics();
    health.rect(-15, -3, 30, 4).fill({ color: 0x111111, alpha: 0.9 });
    health
      .rect(-14, -2, 28 * (state.healthPercent / 100), 2)
      .fill({ color: 0x33cc44 });
    this.plate.addChild(name, health);
    this.updateFrame();
  }

  get floor(): number {
    return this.tileZ;
  }

  get position(): Position {
    return { x: this.tileX, y: this.tileY, z: this.tileZ };
  }

  /** Applies only a fresh authoritative position revision. */
  applyMove(
    position: Position,
    direction: Direction,
    revision: number,
    durationMs: number,
  ): void {
    if (revision < this.positionRevision) return;
    this.direction = direction;
    if (
      revision === this.positionRevision &&
      (position.x !== this.tileX ||
        position.y !== this.tileY ||
        position.z !== this.tileZ)
    ) {
      return;
    }
    if (
      position.x === this.tileX &&
      position.y === this.tileY &&
      position.z === this.tileZ
    ) {
      this.positionRevision = revision;
      this.updateFrame();
      return;
    }
    const renderedPosition = this.pixelPosition();
    const adjacent =
      position.z === this.tileZ &&
      revision === this.positionRevision + 1 &&
      Math.abs(position.x - this.tileX) + Math.abs(position.y - this.tileY) === 1;
    this.fromX = adjacent ? renderedPosition.x / TILE_SIZE : position.x;
    this.fromY = adjacent ? renderedPosition.y / TILE_SIZE : position.y;
    this.tileX = position.x;
    this.tileY = position.y;
    this.tileZ = position.z;
    this.positionRevision = revision;
    this.stepDurationMs = Math.max(1, durationMs);
    this.moveT = adjacent ? 0 : 1;
    if (adjacent) {
      this.walkDirection = direction;
    } else {
      this.walkAnimationPhase = 0;
    }
    this.updateFrame();
  }

  applyCorrection(
    position: Position,
    direction: Direction,
    revision: number,
  ): void {
    if (revision < this.positionRevision) return;
    const confirmsCurrentMove =
      revision === this.positionRevision &&
      position.x === this.tileX &&
      position.y === this.tileY &&
      position.z === this.tileZ;
    if (confirmsCurrentMove) {
      this.direction = direction;
      if (this.moveT >= 1) this.walkDirection = direction;
      this.updateFrame();
      return;
    }
    this.direction = direction;
    this.walkDirection = direction;
    this.tileX = position.x;
    this.tileY = position.y;
    this.tileZ = position.z;
    this.fromX = position.x;
    this.fromY = position.y;
    this.positionRevision = revision;
    this.moveT = 1;
    this.walkAnimationPhase = 0;
    this.updateFrame();
  }

  tick(dtMs: number): void {
    if (this.moveT >= 1) {
      this.footAnimationElapsedMs = Math.min(
        MAX_CLASSIC_FOOT_ANIMATION_DELAY_MS,
        this.footAnimationElapsedMs + dtMs,
      );
      if (this.walkAnimationPhase !== 0) {
        this.walkAnimationPhase = 0;
        this.updateFrame();
      }
      return;
    }

    const movementMs = Math.min(
      dtMs,
      (1 - this.moveT) * this.stepDurationMs,
    );
    this.moveT = Math.min(1, this.moveT + movementMs / this.stepDurationMs);

    const walkPhases = (this.outfit?.phases ?? 1) - 1;
    if (walkPhases > 0) {
      this.footAnimationElapsedMs += movementMs;
      const maxDelayMs =
        walkPhases > 2
          ? MAX_MULTI_PHASE_FOOT_ANIMATION_DELAY_MS
          : MAX_CLASSIC_FOOT_ANIMATION_DELAY_MS;
      const footAnimationDelayMs = Math.max(
        MIN_FOOT_ANIMATION_DELAY_MS,
        Math.min(maxDelayMs, Math.floor(this.stepDurationMs / walkPhases)),
      );
      if (this.footAnimationElapsedMs >= footAnimationDelayMs) {
        this.walkAnimationPhase =
          this.walkAnimationPhase >= walkPhases
            ? 1
            : this.walkAnimationPhase + 1;
        this.footAnimationElapsedMs = 0;
      }
    }
    this.updateFrame();
  }

  pixelPosition(): { x: number; y: number } {
    const t = this.moveT;
    return {
      x: (this.fromX + (this.tileX - this.fromX) * t) * TILE_SIZE,
      y: (this.fromY + (this.tileY - this.fromY) * t) * TILE_SIZE,
    };
  }

  visualPosition(elevation: number): { x: number; y: number } {
    const position = this.pixelPosition();
    return { x: position.x - elevation, y: position.y - elevation };
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.plate.destroy({ children: true });
  }

  private updateFrame(): void {
    if (!this.outfit) {
      this.sprite.texture = Texture.EMPTY;
      return;
    }
    if (this.outfit.category !== "outfit") {
      const key = "item";
      let texture = this.frames.get(key);
      if (!texture) {
        texture = this.store.frameTexture(this.outfit, { phase: 0 });
        this.frames.set(key, texture);
      }
      this.sprite.texture = texture;
      return;
    }
    const walkPhases = this.outfit.phases - 1;
    const moving = this.moveT < 1;
    const phase = moving && walkPhases > 0 ? this.walkAnimationPhase : 0;
    const dir = DIR_INDEX[moving ? this.walkDirection : this.direction];
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
