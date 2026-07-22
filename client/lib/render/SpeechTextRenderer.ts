import { Text, type Container } from "pixi.js";
import type { Position } from "@tibia/protocol";
import type { MapView } from "./MapView";
import { TILE_SIZE } from "./tileSize";

interface SpeechTextView {
  readonly text: Text;
  readonly position: Position;
  readonly durationMs: number;
  elapsedMs: number;
}

const SPEECH_COLOR = 0xf8f358;
const MIN_DURATION_MS = 2_000;
const MS_PER_CHARACTER = 60;
const MAX_DURATION_MS = 8_000;

/**
 * Floats server-delivered speech above the spoken position. Bodies are
 * rendered as canvas text only — player strings never become markup.
 */
export class SpeechTextRenderer {
  private readonly bySpeaker = new Map<string, SpeechTextView>();
  private destroyed = false;

  constructor(
    private readonly mapView: MapView,
    private readonly layer: Container,
  ) {}

  showSpeech(creatureId: string, position: Position, body: string): void {
    if (this.destroyed) return;
    this.removeSpeaker(creatureId);
    const text = new Text({
      text: body,
      style: {
        fontFamily: "Verdana, sans-serif",
        fontSize: 5,
        fontWeight: "bold",
        fill: SPEECH_COLOR,
        stroke: { color: 0x000000, width: 1 },
        wordWrap: true,
        wordWrapWidth: TILE_SIZE * 7,
        align: "center",
      },
    });
    text.resolution = 3;
    text.anchor.set(0.5, 1);
    this.layer.addChild(text);
    this.bySpeaker.set(creatureId, {
      text,
      position: { ...position },
      durationMs: Math.min(
        MAX_DURATION_MS,
        MIN_DURATION_MS + body.length * MS_PER_CHARACTER,
      ),
      elapsedMs: 0,
    });
    this.updatePosition(text, position);
  }

  removeSpeaker(creatureId: string): void {
    const view = this.bySpeaker.get(creatureId);
    if (!view) return;
    view.text.destroy();
    this.bySpeaker.delete(creatureId);
  }

  tick(deltaMs: number): void {
    for (const [creatureId, view] of this.bySpeaker) {
      view.elapsedMs += deltaMs;
      if (view.elapsedMs >= view.durationMs) {
        view.text.destroy();
        this.bySpeaker.delete(creatureId);
        continue;
      }
      this.updatePosition(view.text, view.position);
    }
  }

  private updatePosition(text: Text, position: Position): void {
    const projected = this.mapView.projectPosition(
      position.x * TILE_SIZE + TILE_SIZE / 2,
      position.y * TILE_SIZE - 4,
      position.z,
    );
    text.position.set(projected.x, projected.y);
    text.visible = this.mapView.isDynamicFloorVisible(position.z);
  }

  destroy(): void {
    this.destroyed = true;
    for (const view of this.bySpeaker.values()) view.text.destroy();
    this.bySpeaker.clear();
  }
}
