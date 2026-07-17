import { Text } from "pixi.js";
import type { Position } from "@tibia/protocol";
import { getMapObjectZ } from "./getMapObjectZ";
import type { MapView } from "./MapView";
import { MAP_DEPTH } from "./mapDepth";
import { TILE_SIZE } from "./tileSize";

interface SpeechTextView {
  readonly text: Text;
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

  constructor(private readonly mapView: MapView) {}

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
    text.position.set(
      position.x * TILE_SIZE + TILE_SIZE / 2,
      position.y * TILE_SIZE - 4,
    );
    text.zIndex = getMapObjectZ(position.x, position.y, MAP_DEPTH.effect + 3);
    this.mapView.creatureLayer(position.z).addChild(text);
    this.bySpeaker.set(creatureId, {
      text,
      durationMs: Math.min(
        MAX_DURATION_MS,
        MIN_DURATION_MS + body.length * MS_PER_CHARACTER,
      ),
      elapsedMs: 0,
    });
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
      if (view.elapsedMs < view.durationMs) continue;
      view.text.destroy();
      this.bySpeaker.delete(creatureId);
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const view of this.bySpeaker.values()) view.text.destroy();
    this.bySpeaker.clear();
  }
}
