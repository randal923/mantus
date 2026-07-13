import { Rectangle, Texture } from "pixi.js";

export interface TibiaFlags {
  ground: boolean;
  groundSpeed: number;
  fullGround: boolean;
  notWalkable: boolean;
  blockProjectile: boolean;
  notMoveable: boolean;
  onBottom: boolean;
  onTop: boolean;
}

export interface TibiaObject {
  category: "item" | "outfit" | "effect" | "missile";
  clientId: number;
  width: number;
  height: number;
  layers: number;
  px: number;
  py: number;
  pz: number;
  phases: number;
  groups: number;
  flags: TibiaFlags;
  sprites: number[];
}

interface AtlasIndex {
  tile: number;
  pad: number;
  cell: number;
  sheetPx: number;
  cols: number;
  rows: number;
  tilesPerSheet: number;
  sheetCount: number;
  spriteCount: number;
  sheets: string[];
}

export interface SpritePattern {
  w?: number; // sprite piece column (0 = bottom-right anchor)
  h?: number; // sprite piece row
  l?: number; // layer
  x?: number; // pattern x (direction for outfits, map x variation for items)
  y?: number; // pattern y
  z?: number; // pattern z
  phase?: number;
}

export type RGB = [number, number, number];

export interface OutfitColors {
  head: RGB;
  body: RGB;
  legs: RGB;
  feet: RGB;
}

const ASSET_BASE = "/assets";

export class AssetStore {
  index!: AtlasIndex;
  outfitPalette: RGB[] = [];
  private items = new Map<number, TibiaObject>();
  private outfits = new Map<number, TibiaObject>();
  private effects = new Map<number, TibiaObject>();
  private sheetImages: (HTMLImageElement | undefined)[] = [];
  private sheetTextures: (Texture | undefined)[] = [];
  private spriteTexCache = new Map<number, Texture>();

  async load(): Promise<void> {
    const [index, objectsFile, palette] = await Promise.all([
      fetch(`${ASSET_BASE}/atlas-index.json`).then((r) => r.json()),
      fetch(`${ASSET_BASE}/objects.json`).then((r) => r.json()),
      fetch(`${ASSET_BASE}/outfit-colors.json`).then((r) => r.json()),
    ]);
    this.index = index;
    this.outfitPalette = palette;
    for (const o of objectsFile.objects as TibiaObject[]) {
      if (o.category === "item") this.items.set(o.clientId, o);
      else if (o.category === "outfit") this.outfits.set(o.clientId, o);
      else if (o.category === "effect") this.effects.set(o.clientId, o);
    }
  }

  item(id: number): TibiaObject {
    const o = this.items.get(id);
    if (!o) throw new Error(`unknown item ${id}`);
    return o;
  }

  outfit(id: number): TibiaObject {
    const o = this.outfits.get(id);
    if (!o) throw new Error(`unknown outfit ${id}`);
    return o;
  }

  effect(id: number): TibiaObject {
    const o = this.effects.get(id);
    if (!o) throw new Error(`unknown effect ${id}`);
    return o;
  }

  spriteIndex(o: TibiaObject, p: SpritePattern): number {
    const { w = 0, h = 0, l = 0, x = 0, y = 0, z = 0, phase = 0 } = p;
    return (
      (((((phase * o.pz + z) * o.py + y % o.py) * o.px + x % o.px) * o.layers + l) * o.height + h) *
        o.width +
      w
    );
  }

  spriteId(o: TibiaObject, p: SpritePattern): number {
    return o.sprites[this.spriteIndex(o, p)] ?? 0;
  }

  private spriteRect(spriteId: number): { sheet: number; x: number; y: number } {
    const cell = spriteId - 1;
    const sheet = Math.floor(cell / this.index.tilesPerSheet);
    const rem = cell % this.index.tilesPerSheet;
    return {
      sheet,
      x: (rem % this.index.cols) * this.index.cell + this.index.pad,
      y: Math.floor(rem / this.index.cols) * this.index.cell + this.index.pad,
    };
  }

  /** Load the atlas sheets containing the given sprite ids (as images + textures). */
  async preload(spriteIds: Iterable<number>): Promise<void> {
    const sheets = new Set<number>();
    for (const id of spriteIds) {
      if (id > 0) sheets.add(this.spriteRect(id).sheet);
    }
    for (const s of [...sheets].sort((a, b) => a - b)) {
      if (this.sheetImages[s]) continue;
      const img = new Image();
      img.src = `${ASSET_BASE}/${this.index.sheets[s]}`;
      try {
        await img.decode();
      } catch {
        // decode() can fail under memory pressure; fall back to load events
        await new Promise<void>((resolve, reject) => {
          if (img.complete && img.naturalWidth > 0) return resolve();
          img.onload = () => resolve();
          img.onerror = () => reject(new Error(`failed to load ${img.src}`));
        });
      }
      this.sheetImages[s] = img;
      const tex = Texture.from(img);
      tex.source.scaleMode = "nearest";
      this.sheetTextures[s] = tex;
    }
  }

  /** Every sprite id an object can display (all patterns/phases/layers/pieces). */
  allSprites(o: TibiaObject): number[] {
    return o.sprites;
  }

  spriteTexture(spriteId: number): Texture {
    if (spriteId <= 0) return Texture.EMPTY;
    const cached = this.spriteTexCache.get(spriteId);
    if (cached) return cached;
    const r = this.spriteRect(spriteId);
    const sheet = this.sheetTextures[r.sheet];
    if (!sheet) throw new Error(`atlas sheet ${r.sheet} not preloaded (sprite ${spriteId})`);
    const tex = new Texture({
      source: sheet.source,
      frame: new Rectangle(r.x, r.y, this.index.tile, this.index.tile),
    });
    this.spriteTexCache.set(spriteId, tex);
    return tex;
  }

  /**
   * Bake one full frame of an object (all w×h pieces, all layers) into a canvas.
   * When `colors` is given and the object has a mask layer (layers=2), applies
   * Tibia outfit colorization: mask yellow=head, red=body, green=legs, blue=feet.
   */
  bakeFrame(o: TibiaObject, p: SpritePattern, colors?: OutfitColors): HTMLCanvasElement {
    const t = this.index.tile;
    const canvas = document.createElement("canvas");
    canvas.width = o.width * t;
    canvas.height = o.height * t;
    const ctx = canvas.getContext("2d")!;

    const drawLayer = (target: CanvasRenderingContext2D, layer: number) => {
      for (let h = 0; h < o.height; h++) {
        for (let w = 0; w < o.width; w++) {
          const sid = this.spriteId(o, { ...p, w, h, l: layer });
          if (!sid) continue;
          const r = this.spriteRect(sid);
          const img = this.sheetImages[r.sheet];
          if (!img) throw new Error(`atlas sheet ${r.sheet} not preloaded (sprite ${sid})`);
          target.drawImage(
            img,
            r.x,
            r.y,
            t,
            t,
            (o.width - 1 - w) * t,
            (o.height - 1 - h) * t,
            t,
            t
          );
        }
      }
    };

    drawLayer(ctx, 0);

    if (colors && o.layers > 1) {
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext("2d")!;
      drawLayer(maskCtx, 1);

      const base = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const mask = maskCtx.getImageData(0, 0, canvas.width, canvas.height);
      const b = base.data;
      const m = mask.data;
      for (let i = 0; i < m.length; i += 4) {
        if (m[i + 3] < 128) continue;
        const r = m[i] > 127;
        const g = m[i + 1] > 127;
        const bl = m[i + 2] > 127;
        let c: RGB | undefined;
        if (r && g && !bl) c = colors.head;
        else if (r && !g && !bl) c = colors.body;
        else if (!r && g && !bl) c = colors.legs;
        else if (!r && !g && bl) c = colors.feet;
        if (!c) continue;
        b[i] = (b[i] * c[0]) / 255;
        b[i + 1] = (b[i + 1] * c[1]) / 255;
        b[i + 2] = (b[i + 2] * c[2]) / 255;
      }
      ctx.putImageData(base, 0, 0);
    }

    return canvas;
  }

  frameTexture(o: TibiaObject, p: SpritePattern, colors?: OutfitColors): Texture {
    const tex = Texture.from(this.bakeFrame(o, p, colors));
    tex.source.scaleMode = "nearest";
    return tex;
  }
}
