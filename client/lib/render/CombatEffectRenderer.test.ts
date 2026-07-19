import { Text } from "pixi.js";
import { describe, expect, it } from "vitest";
import type { AssetStore } from "./AssetStore";
import { CombatEffectRenderer } from "./CombatEffectRenderer";
import { MapView } from "./MapView";
import { TILE_SIZE } from "./tileSize";

describe("CombatEffectRenderer", () => {
  it("floats white experience text upward and removes it", () => {
    const mapView = new MapView({} as AssetStore);
    const renderer = new CombatEffectRenderer({} as AssetStore, mapView);
    const position = { x: 10, y: 8, z: 7 };

    renderer.showExperienceText(position, 42);

    const text = mapView.creatureLayer(position.z).children[0];
    if (!(text instanceof Text)) throw new Error("expected experience text");
    expect(text.text).toBe("42");
    expect(text.style.fill).toBe(0xffffff);
    const startY = text.position.y;

    renderer.tick(450);

    expect(text.position.y).toBe(startY - TILE_SIZE / 4);
    expect(text.alpha).toBe(0.5);

    renderer.tick(450);

    expect(mapView.creatureLayer(position.z).children).toHaveLength(0);
    renderer.destroy();
  });
});
