import { Container, Text } from "pixi.js";
import { describe, expect, it } from "vitest";
import type { AssetStore } from "./AssetStore";
import { MapView } from "./MapView";
import { SpeechTextRenderer } from "./SpeechTextRenderer";
import { TILE_SIZE } from "./tileSize";

describe("SpeechTextRenderer", () => {
  it("renders speech in a dedicated layer above the map", () => {
    const mapView = new MapView({} as AssetStore);
    const speechLayer = new Container();
    const renderer = new SpeechTextRenderer(mapView, speechLayer);
    const position = { x: 10, y: 8, z: 7 };
    mapView.setCenter(position.x, position.y, position.z);

    renderer.showSpeech("player-1", position, "Hello");

    expect(mapView.creatureLayer(position.z).children).toHaveLength(0);
    expect(speechLayer.children).toHaveLength(1);
    const text = speechLayer.children[0];
    if (!(text instanceof Text)) throw new Error("expected speech text");
    expect(text.position.x).toBe(position.x * TILE_SIZE + TILE_SIZE / 2);
    expect(text.position.y).toBe(position.y * TILE_SIZE - 4);
    expect(text.visible).toBe(true);

    renderer.destroy();
  });
});
