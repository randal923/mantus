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

    const text = mapView.effectLayer(position.z).children[0];
    if (!(text instanceof Text)) throw new Error("expected experience text");
    expect(text.text).toBe("42");
    expect(text.style.fill).toBe(0xffffff);
    const startY = text.position.y;

    renderer.tick(450);

    expect(text.position.y).toBe(startY - TILE_SIZE / 4);
    expect(text.alpha).toBe(0.5);

    renderer.tick(450);

    expect(mapView.effectLayer(position.z).children).toHaveLength(0);
    renderer.destroy();
  });

  it("reuses pooled floating text instances with fresh label and alpha", () => {
    const mapView = new MapView({} as AssetStore);
    const renderer = new CombatEffectRenderer({} as AssetStore, mapView);
    const position = { x: 10, y: 8, z: 7 };

    renderer.showExperienceText(position, 42);
    const first = mapView.effectLayer(position.z).children[0];
    renderer.tick(900);
    expect(mapView.effectLayer(position.z).children).toHaveLength(0);

    renderer.showCombatText(position, 7, "physical", "none");
    const second = mapView.effectLayer(position.z).children[0];
    if (!(second instanceof Text)) throw new Error("expected combat text");
    expect(second).toBe(first);
    expect(second.text).toBe("-7");
    expect(second.alpha).toBe(1);
    expect(second.style.fill).toBe(0xff5555);
    renderer.destroy();
  });
});
