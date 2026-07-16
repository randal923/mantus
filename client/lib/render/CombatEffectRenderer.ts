import { Sprite, Text, type Texture } from "pixi.js";
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

interface MagicEffectView {
  readonly sprite: Sprite;
  readonly frames: Texture[];
  readonly durations: number[];
  elapsedMs: number;
  phase: number;
}

interface MissileView {
  readonly sprite: Sprite;
  readonly texture: Texture;
  readonly from: Position;
  readonly to: Position;
  readonly durationMs: number;
  elapsedMs: number;
}

interface CombatTextView {
  readonly text: Text;
  readonly position: Position;
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

export class CombatEffectRenderer {
  private readonly effects: MagicEffectView[] = [];
  private readonly missiles: MissileView[] = [];
  private readonly texts: CombatTextView[] = [];
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
    const text = new Text({
      text: label,
      style: {
        fontFamily: "Verdana, sans-serif",
        fontSize: 5,
        fontWeight: "bold",
        fill:
          block === "miss" || block === "immunity"
            ? 0xdddddd
            : TEXT_COLORS[damageType],
        stroke: { color: 0x000000, width: 1 },
      },
    });
    text.resolution = 3;
    text.anchor.set(0.5, 1);
    text.position.set(
      position.x * TILE_SIZE + TILE_SIZE / 2,
      position.y * TILE_SIZE,
    );
    text.zIndex = getMapObjectZ(position.x, position.y, MAP_DEPTH.effect + 2);
    this.mapView.creatureLayer(position.z).addChild(text);
    this.texts.push({ text, position: { ...position }, elapsedMs: 0 });
  }

  tick(deltaMs: number): void {
    for (let index = this.effects.length - 1; index >= 0; index--) {
      const effect = this.effects[index];
      if (!effect) continue;
      effect.elapsedMs += deltaMs;
      while (
        effect.phase < effect.frames.length &&
        effect.elapsedMs >= (effect.durations[effect.phase] ?? 100)
      ) {
        effect.elapsedMs -= effect.durations[effect.phase] ?? 100;
        effect.phase++;
        if (effect.phase < effect.frames.length) {
          effect.sprite.texture = effect.frames[effect.phase]!;
        }
      }
      if (effect.phase < effect.frames.length) continue;
      effect.sprite.destroy();
      for (const frame of effect.frames) frame.destroy(true);
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
      missile.sprite.position.set(
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
      missile.sprite.destroy();
      missile.texture.destroy(true);
      this.missiles.splice(index, 1);
    }

    for (let index = this.texts.length - 1; index >= 0; index--) {
      const entry = this.texts[index];
      if (!entry) continue;
      entry.elapsedMs += deltaMs;
      const progress = Math.min(1, entry.elapsedMs / 900);
      entry.text.position.y =
        entry.position.y * TILE_SIZE - progress * (TILE_SIZE / 2);
      entry.text.alpha = 1 - progress;
      if (progress < 1) continue;
      entry.text.destroy();
      this.texts.splice(index, 1);
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const effect of this.effects) {
      effect.sprite.destroy();
      for (const frame of effect.frames) frame.destroy(true);
    }
    for (const missile of this.missiles) {
      missile.sprite.destroy();
      missile.texture.destroy(true);
    }
    for (const entry of this.texts) entry.text.destroy();
    this.effects.length = 0;
    this.missiles.length = 0;
    this.texts.length = 0;
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
    const frames = Array.from({ length: appearance.phases }, (_, phase) =>
      this.store.frameTexture(appearance, { phase }),
    );
    const durations = frames.map(
      (_, phase) =>
        appearance.animation?.phases[phase]?.minimumDurationMs ?? 100,
    );
    const sprite = new Sprite(frames[0]);
    sprite.position.set(
      position.x * TILE_SIZE -
        (appearance.width - 1) * TILE_SIZE -
        appearance.flags.displacementX,
      position.y * TILE_SIZE -
        (appearance.height - 1) * TILE_SIZE -
        appearance.flags.displacementY,
    );
    sprite.zIndex = getMapObjectZ(
      position.x,
      position.y,
      MAP_DEPTH.effect + 1,
    );
    this.mapView.creatureLayer(position.z).addChild(sprite);
    this.effects.push({
      sprite,
      frames,
      durations,
      elapsedMs: 0,
      phase: 0,
    });
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
    const texture = this.store.frameTexture(appearance, {
      x: this.missilePattern(from, to, appearance.px),
      phase: 0,
    });
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(
      from.x * TILE_SIZE + TILE_SIZE / 2,
      from.y * TILE_SIZE + TILE_SIZE / 2,
    );
    sprite.zIndex = getMapObjectZ(from.x, from.y, MAP_DEPTH.effect);
    this.mapView.creatureLayer(from.z).addChild(sprite);
    this.missiles.push({
      sprite,
      texture,
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
