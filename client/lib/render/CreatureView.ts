import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { CreatureState, Direction, Position } from "@tibia/protocol";
import type { AssetStore, OutfitColors, TibiaObject } from "./AssetStore";
import { TILE_SIZE } from "./tileSize";

const MIN_FOOT_ANIMATION_DELAY_MS = 20;
const MAX_CLASSIC_FOOT_ANIMATION_DELAY_MS = 205;
const MAX_MULTI_PHASE_FOOT_ANIMATION_DELAY_MS = 80;
const SPRITE_DISPLACEMENT = 8;

export type PartyShieldKind =
  | "none"
  | "public-member"
  | "member"
  | "leader"
  | "member-shared"
  | "leader-shared";

const PARTY_SHIELD_COLORS: Record<
  Exclude<PartyShieldKind, "none">,
  number
> = {
  "public-member": 0x8f959c,
  member: 0x2f6fdb,
  leader: 0xd9b826,
  "member-shared": 0x2f6fdb,
  "leader-shared": 0xd9b826,
};

export type WarEmblemKind = "none" | "ally" | "enemy" | "other-war";

const WAR_EMBLEM_COLORS: Record<Exclude<WarEmblemKind, "none">, number> = {
  ally: 0x2f8fdb,
  enemy: 0xdd2f2f,
  "other-war": 0xd9b826,
};

/**
 * Skull mark colors (project-drawn vector glyphs, no ripped assets). The
 * server already filtered which mark this viewer may see; this is display
 * only.
 */
const SKULL_MARK_COLORS: Record<
  NonNullable<CreatureState["skull"]>,
  { fill: number; stroke: number; eyes: number }
> = {
  white: { fill: 0xf2f2f2, stroke: 0x000000, eyes: 0x000000 },
  yellow: { fill: 0xe8d24a, stroke: 0x000000, eyes: 0x000000 },
  orange: { fill: 0xe0862e, stroke: 0x000000, eyes: 0x000000 },
  red: { fill: 0xd92c2c, stroke: 0x000000, eyes: 0x000000 },
  black: { fill: 0x141414, stroke: 0xdadada, eyes: 0xffffff },
};

const DIR_INDEX: Record<Direction, number> = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
  northeast: 1,
  southeast: 1,
  southwest: 3,
  northwest: 3,
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
  private readonly light = new Graphics();
  private readonly attackTarget = new Graphics();
  private readonly health = new Graphics();
  private readonly partyShield = new Graphics();
  private readonly warEmblem = new Graphics();
  private readonly skullMark = new Graphics();
  private readonly name: Text;
  private publicPartyMember: boolean;
  private publicGuildName: string | null;
  private publicAtWar: boolean;
  private readonly appearance: CreatureState["outfit"];
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
        -(outfit.width - 1) * TILE_SIZE - SPRITE_DISPLACEMENT,
        -(outfit.height - 1) * TILE_SIZE - SPRITE_DISPLACEMENT,
      );
    }
    this.attackTarget
      .rect(-7, -7, TILE_SIZE - 2, TILE_SIZE - 2)
      .stroke({ color: 0xff2222, width: 2 });
    this.attackTarget.visible = false;
    this.container.sortableChildren = true;
    this.light.zIndex = -1;
    this.container.addChild(this.sprite, this.attackTarget, this.light);

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
    this.name = name;
    this.appearance = { ...state.outfit };
    this.publicPartyMember = state.partyStatus === "member";
    this.publicGuildName = state.guildName ?? null;
    this.publicAtWar = state.atWar ?? false;
    this.plate.addChild(
      name,
      this.health,
      this.partyShield,
      this.warEmblem,
      this.skullMark,
    );
    this.drawSkullMark(state.skull);
    this.updateHealth(state.healthPercent);
    this.updateLight(state.light);
    this.updateFrame();
  }

  get floor(): number {
    return this.tileZ;
  }

  get cullMarginTiles(): number {
    return Math.max(this.outfit?.width ?? 1, this.outfit?.height ?? 1);
  }

  get position(): Position {
    return { x: this.tileX, y: this.tileY, z: this.tileZ };
  }

  hasAppearance(appearance: CreatureState["outfit"]): boolean {
    return (
      appearance.lookType === this.appearance.lookType &&
      appearance.lookTypeEx === this.appearance.lookTypeEx &&
      appearance.head === this.appearance.head &&
      appearance.body === this.appearance.body &&
      appearance.legs === this.appearance.legs &&
      appearance.feet === this.appearance.feet &&
      appearance.addons === this.appearance.addons
    );
  }

  /** Applies state-only changes without interrupting an in-flight step. */
  updateState(state: CreatureState): void {
    this.applyCorrection(
      state.position,
      state.direction,
      state.positionRevision,
    );
    this.publicPartyMember = state.partyStatus === "member";
    this.publicGuildName = state.guildName ?? null;
    this.publicAtWar = state.atWar ?? false;
    this.drawSkullMark(state.skull);
    this.updateHealth(state.healthPercent);
    this.updateLight(state.light);
  }

  setAttackTarget(targeted: boolean): void {
    this.attackTarget.visible = targeted;
  }

  containsScreenPoint(x: number, y: number): boolean {
    if (!this.container.visible) return false;
    const point = this.container.toLocal({ x, y });
    return (
      point.x >= -SPRITE_DISPLACEMENT &&
      point.x < TILE_SIZE - SPRITE_DISPLACEMENT &&
      point.y >= -SPRITE_DISPLACEMENT &&
      point.y < TILE_SIZE - SPRITE_DISPLACEMENT
    );
  }

  /** True when the server flagged this creature as publicly partied. */
  get isPublicPartyMember(): boolean {
    return this.publicPartyMember;
  }

  /** Draws the party shield next to the name plate (display only). */
  setPartyShield(kind: PartyShieldKind): void {
    this.partyShield.clear();
    if (kind === "none") return;
    const x = -this.name.width / 2 - 9;
    const y = -14;
    this.partyShield
      .poly([x - 4, y - 4, x + 4, y - 4, x + 4, y, x, y + 5, x - 4, y])
      .fill({ color: PARTY_SHIELD_COLORS[kind] })
      .stroke({
        color:
          kind === "member-shared" || kind === "leader-shared"
            ? 0x9dff9d
            : 0x000000,
        width: 1,
      });
  }

  /** Public guild affiliation the server broadcast for this creature. */
  get guildName(): string | null {
    return this.publicGuildName;
  }

  /** True while this creature's guild has an active war (public flag). */
  get isAtWar(): boolean {
    return this.publicAtWar;
  }

  /**
   * Draws the viewer-relative war emblem opposite the party shield
   * (display only — derived client-side from public creature flags plus
   * the viewer's own guild-state).
   */
  setWarEmblem(kind: WarEmblemKind): void {
    this.warEmblem.clear();
    if (kind === "none") return;
    const x = this.name.width / 2 + 9;
    const y = -14;
    this.warEmblem
      .poly([x - 4, y - 4, x + 4, y - 4, x + 4, y + 4, x, y + 1, x - 4, y + 4])
      .fill({ color: WAR_EMBLEM_COLORS[kind] })
      .stroke({ color: 0x000000, width: 1 });
  }

  /**
   * Draws the skull glyph beyond the war emblem slot on the right of the
   * plate (coexists with the party shield on the left). The mark arrives
   * pre-filtered per viewer in the creature state, so rebuilding the view
   * on creature-state-changed keeps it current.
   */
  private drawSkullMark(kind: CreatureState["skull"]): void {
    this.skullMark.clear();
    if (!kind) return;
    const colors = SKULL_MARK_COLORS[kind];
    const x = this.name.width / 2 + 19;
    const y = -15;
    this.skullMark
      .circle(x, y, 3.6)
      .fill({ color: colors.fill })
      .stroke({ color: colors.stroke, width: 1 });
    this.skullMark
      .rect(x - 2.2, y + 2.6, 4.4, 2.6)
      .fill({ color: colors.fill })
      .stroke({ color: colors.stroke, width: 1 });
    this.skullMark
      .circle(x - 1.4, y - 0.6, 0.8)
      .circle(x + 1.4, y - 0.6, 0.8)
      .fill({ color: colors.eyes });
  }

  updateHealth(healthPercent: number | null): void {
    this.health.visible = healthPercent !== null;
    if (healthPercent === null) {
      this.health.clear();
      return;
    }
    const bounded = Math.min(100, Math.max(0, healthPercent));
    const color =
      bounded > 60 ? 0x33cc44 : bounded > 30 ? 0xffbb33 : 0xee4444;
    this.health.clear();
    this.health.rect(-15, -3, 30, 4).fill({ color: 0x111111, alpha: 0.9 });
    this.health
      .rect(-14, -2, 28 * (bounded / 100), 2)
      .fill({ color });
  }

  updateLight(light: CreatureState["light"]): void {
    this.light.clear();
    if (!light || light.intensity <= 0) return;
    this.light
      .circle(
        TILE_SIZE / 2,
        TILE_SIZE / 2,
        Math.min(48, 10 + light.intensity * 2),
      )
      .fill({ color: 0xffd37a, alpha: Math.min(0.35, light.intensity / 100) });
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
      Math.max(
        Math.abs(position.x - this.tileX),
        Math.abs(position.y - this.tileY),
      ) === 1;
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
      this.sprite.texture = this.store.cachedFrameTexture(this.outfit, {
        phase: 0,
      });
      return;
    }
    const walkPhases = this.outfit.phases - 1;
    const moving = this.moveT < 1;
    const phase = moving && walkPhases > 0 ? this.walkAnimationPhase : 0;
    const dir = DIR_INDEX[moving ? this.walkDirection : this.direction];
    this.sprite.texture = this.store.cachedFrameTexture(
      this.outfit,
      { x: dir, phase },
      this.colors,
    );
  }
}
