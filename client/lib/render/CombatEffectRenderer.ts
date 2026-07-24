import { Container, Sprite, Text, Texture } from "pixi.js";
import type {
  DamageType,
  HitBlock,
  Position,
} from "@tibia/protocol";
import type { AssetStore, TibiaObject } from "./AssetStore";
import { getMapObjectZ } from "./getMapObjectZ";
import type { MapView } from "./MapView";
import { MAP_DEPTH } from "./mapDepth";
import { TILE_SIZE } from "./tileSize";

interface MagicEffectPiece {
  readonly sprite: Sprite;
  /** Shared atlas sub-rect textures per phase — never destroyed here. */
  readonly textures: Texture[];
}

interface MagicEffectView {
  readonly container: Container;
  readonly pieces: MagicEffectPiece[];
  readonly durations: number[];
  readonly phaseCount: number;
  elapsedMs: number;
  phase: number;
}

interface MissileView {
  readonly container: Container;
  readonly from: Position;
  readonly to: Position;
  readonly durationMs: number;
  elapsedMs: number;
}

interface CombatTextView {
  readonly text: Text;
  readonly position: Position;
  readonly offsetY: number;
  elapsedMs: number;
}

const TEXT_COLORS: Record<DamageType, number> = {
  physical: 0xff5555,
  energy: 0x66aaff,
  earth: 0x66cc66,
  fire: 0xff8833,
  "life-drain": 0xcc66cc,
  "mana-drain": 0x6688ff,
  drown: 0x66bbdd,
  ice: 0xaaddff,
  holy: 0xffff99,
  death: 0xaa66cc,
  healing: 0x66ff88,
};
const EXPERIENCE_TEXT_COLOR = 0xffffff;
const EXPERIENCE_TEXT_OFFSET_Y = -6;
const MAX_POOLED_TEXTS = 32;

export class CombatEffectRenderer {
  private readonly effects: MagicEffectView[] = [];
  private readonly missiles: MissileView[] = [];
  private readonly texts: CombatTextView[] = [];
  private readonly textPool: Text[] = [];
  private destroyed = false;

  constructor(
    private readonly store: AssetStore,
    private readonly mapView: MapView,
  ) {}

  showMagicEffect(position: Position, effectId: number): void {
    void this.loadMagicEffect(position, effectId);
  }

  showMissile(
    from: Position,
    to: Position,
    missileId: number,
    durationMs: number,
  ): void {
    void this.loadMissile(from, to, missileId, durationMs);
  }

  showCombatText(
    position: Position,
    value: number,
    damageType: DamageType,
    block: HitBlock,
  ): void {
    if (this.destroyed) return;
    const label =
      block === "miss"
        ? "MISS"
        : block === "immunity"
          ? "IMMUNE"
          : block === "armor" || block === "shield"
            ? "BLOCK"
          : damageType === "healing"
            ? `+${value}`
            : `-${value}`;
    this.showFloatingText(
      position,
      label,
      block === "miss" || block === "immunity"
        ? 0xdddddd
        : TEXT_COLORS[damageType],
      0,
    );
  }

  showExperienceText(position: Position, value: number): void {
    if (this.destroyed) return;
    this.showFloatingText(
      position,
      value.toString(),
      EXPERIENCE_TEXT_COLOR,
      EXPERIENCE_TEXT_OFFSET_Y,
    );
  }

  private showFloatingText(
    position: Position,
    label: string,
    color: number,
    offsetY: number,
  ): void {
    const pooled = this.textPool.pop();
    const text =
      pooled ??
      new Text({
        text: label,
        style: {
          fontFamily: "Verdana, sans-serif",
          fontSize: 5,
          fontWeight: "bold",
          fill: color,
          stroke: { color: 0x000000, width: 1 },
        },
      });
    if (pooled) {
      pooled.text = label;
      pooled.style.fill = color;
      pooled.alpha = 1;
    } else {
      text.resolution = 3;
      text.anchor.set(0.5, 1);
    }
    text.position.set(
      position.x * TILE_SIZE + TILE_SIZE / 2,
      position.y * TILE_SIZE + offsetY,
    );
    text.zIndex = getMapObjectZ(position.x, position.y, MAP_DEPTH.effect + 2);
    this.mapView.effectLayer(position.z).addChild(text);
    this.texts.push({
      text,
      position: { ...position },
      offsetY,
      elapsedMs: 0,
    });
  }

  tick(deltaMs: number): void {
    for (let index = this.effects.length - 1; index >= 0; index--) {
      const effect = this.effects[index];
      if (!effect) continue;
      effect.elapsedMs += deltaMs;
      while (
        effect.phase < effect.phaseCount &&
        effect.elapsedMs >= (effect.durations[effect.phase] ?? 100)
      ) {
        effect.elapsedMs -= effect.durations[effect.phase] ?? 100;
        effect.phase++;
        if (effect.phase < effect.phaseCount) {
          for (const piece of effect.pieces) {
            piece.sprite.texture = piece.textures[effect.phase]!;
          }
        }
      }
      if (effect.phase < effect.phaseCount) continue;
      effect.container.destroy({ children: true });
      this.effects.splice(index, 1);
    }

    for (let index = this.missiles.length - 1; index >= 0; index--) {
      const missile = this.missiles[index];
      if (!missile) continue;
      missile.elapsedMs = Math.min(
        missile.durationMs,
        missile.elapsedMs + deltaMs,
      );
      const progress = missile.elapsedMs / missile.durationMs;
      missile.container.position.set(
        (missile.from.x +
          (missile.to.x - missile.from.x) * progress) *
          TILE_SIZE +
          TILE_SIZE / 2,
        (missile.from.y +
          (missile.to.y - missile.from.y) * progress) *
          TILE_SIZE +
          TILE_SIZE / 2,
      );
      if (progress < 1) continue;
      missile.container.destroy({ children: true });
      this.missiles.splice(index, 1);
    }

    for (let index = this.texts.length - 1; index >= 0; index--) {
      const entry = this.texts[index];
      if (!entry) continue;
      entry.elapsedMs += deltaMs;
      const progress = Math.min(1, entry.elapsedMs / 900);
      entry.text.position.y =
        entry.position.y * TILE_SIZE +
        entry.offsetY -
        progress * (TILE_SIZE / 2);
      entry.text.alpha = 1 - progress;
      if (progress < 1) continue;
      this.releaseText(entry.text);
      this.texts.splice(index, 1);
    }
  }

  private releaseText(text: Text): void {
    text.removeFromParent();
    if (this.textPool.length >= MAX_POOLED_TEXTS) {
      text.destroy();
      return;
    }
    this.textPool.push(text);
  }

  destroy(): void {
    this.destroyed = true;
    for (const effect of this.effects) {
      effect.container.destroy({ children: true });
    }
    for (const missile of this.missiles) {
      missile.container.destroy({ children: true });
    }
    for (const entry of this.texts) entry.text.destroy();
    for (const text of this.textPool) text.destroy();
    this.effects.length = 0;
    this.missiles.length = 0;
    this.texts.length = 0;
    this.textPool.length = 0;
  }

  private async loadMagicEffect(
    position: Position,
    effectId: number,
  ): Promise<void> {
    let appearance: TibiaObject;
    try {
      appearance = this.store.effect(effectId);
      await this.store.preload(appearance.sprites);
    } catch {
      return;
    }
    if (this.destroyed) return;
    const durations = Array.from(
      { length: appearance.phases },
      (_, phase) =>
        appearance.animation?.phases[phase]?.minimumDurationMs ?? 100,
    );
    const container = new Container();
    container.position.set(
      position.x * TILE_SIZE -
        (appearance.width - 1) * TILE_SIZE -
        appearance.flags.displacementX,
      position.y * TILE_SIZE -
        (appearance.height - 1) * TILE_SIZE -
        appearance.flags.displacementY,
    );
    container.zIndex = getMapObjectZ(
      position.x,
      position.y,
      MAP_DEPTH.effect + 1,
    );
    const pieces = this.buildPieces(appearance, container);
    this.mapView.effectLayer(position.z).addChild(container);
    this.effects.push({
      container,
      pieces,
      durations,
      phaseCount: appearance.phases,
      elapsedMs: 0,
      phase: 0,
    });
  }

  /** One sprite per w×h piece, textured from the shared atlas per phase. */
  private buildPieces(
    appearance: TibiaObject,
    container: Container,
    patternX = 0,
  ): MagicEffectPiece[] {
    const pieces: MagicEffectPiece[] = [];
    for (let h = 0; h < appearance.height; h++) {
      for (let w = 0; w < appearance.width; w++) {
        const textures = Array.from({ length: appearance.phases }, (_, phase) =>
          this.store.spriteTexture(
            this.store.spriteId(appearance, { x: patternX, w, h, phase }),
          ),
        );
        if (textures.every((texture) => texture === Texture.EMPTY)) continue;
        const sprite = new Sprite(textures[0]);
        sprite.position.set(
          (appearance.width - 1 - w) * TILE_SIZE,
          (appearance.height - 1 - h) * TILE_SIZE,
        );
        container.addChild(sprite);
        pieces.push({ sprite, textures });
      }
    }
    return pieces;
  }

  private async loadMissile(
    from: Position,
    to: Position,
    missileId: number,
    durationMs: number,
  ): Promise<void> {
    let appearance: TibiaObject;
    try {
      appearance = this.store.missile(missileId);
      await this.store.preload(appearance.sprites);
    } catch {
      return;
    }
    if (this.destroyed || from.z !== to.z) return;
    const container = new Container();
    container.position.set(
      from.x * TILE_SIZE + TILE_SIZE / 2,
      from.y * TILE_SIZE + TILE_SIZE / 2,
    );
    container.zIndex = getMapObjectZ(from.x, from.y, MAP_DEPTH.effect);
    const pieces = this.buildPieces(
      appearance,
      container,
      this.missilePattern(from, to, appearance.px),
    );
    // Recenter pieces so the container origin matches the old canvas center.
    for (const piece of pieces) {
      piece.sprite.position.x -= (appearance.width * TILE_SIZE) / 2;
      piece.sprite.position.y -= (appearance.height * TILE_SIZE) / 2;
    }
    this.mapView.effectLayer(from.z).addChild(container);
    this.missiles.push({
      container,
      from: { ...from },
      to: { ...to },
      durationMs,
      elapsedMs: 0,
    });
  }

  private missilePattern(
    from: Position,
    to: Position,
    patternCount: number,
  ): number {
    if (patternCount <= 1) return 0;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const direction = Math.round((angle / (Math.PI * 2)) * 8 + 8) % 8;
    return direction % patternCount;
  }
}
