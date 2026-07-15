import { Container, Sprite } from "pixi.js";
import type { Position, TileState, ViewRange } from "@tibia/protocol";
import type { AssetStore, TibiaObject } from "./AssetStore";
import { getFirstVisibleFloor } from "./getFirstVisibleFloor";
import { getMapItemPattern } from "./getMapItemPattern";
import { getMapObjectZ } from "./getMapObjectZ";
import { getOrderedTileObjects } from "./getOrderedTileObjects";
import { getVisibleFloors } from "./getVisibleFloors";
import { TILE_SIZE } from "./tileSize";

const GROUND_FLOOR = 7;
/** Draw deeper floors first so physically higher floors can cover them. */
const FLOORS = Array.from({ length: 16 }, (_, index) => 15 - index);
const STATIC_TILE_MARGIN = 2;
const MAX_CACHED_REGIONS = 48;
const MAX_ELEVATION = 24;

interface MapManifest {
  regionSize: number;
  regions: Record<string, [number, number][]>;
}

interface Region {
  /** (dy * regionSize + dx) -> draw ids in stack order (converter output). */
  tiles: Map<number, number[]>;
}

interface FloorLayers {
  container: Container;
  ground: Container;
  objects: Container;
}

/**
 * Streams converted map regions (see tools/convertOtbm.mjs) over HTTP and
 * keeps a sliding window of tiles drawn around the own player. Terrain is
 * public, static data; everything dynamic still arrives over the socket.
 *
 * Floors above ground draw offset one tile up-left per level (Tibia's
 * height perspective) and are hidden while the player stands under a roof.
 */
export class MapView {
  readonly container = new Container();
  private readonly floors = new Map<number, FloorLayers>();
  private manifest: MapManifest | null = null;
  private mapName = "";
  /** z -> region keys that exist on disk for that floor. */
  private readonly available = new Map<number, Set<string>>();
  private readonly regions = new Map<string, Promise<Region | null>>();
  private readonly loaded = new Map<string, Region | null>();
  private readonly regionUse = new Map<string, number>();
  private readonly drawnTiles = new Map<string, Sprite[]>();
  private readonly dynamicTiles = new Map<string, Sprite[]>();
  private readonly dynamicRequests = new Map<string, TileState>();
  private center: { x: number; y: number; z: number } | null = null;
  private viewRange: ViewRange = { x: 1, y: 1 };
  private generation = 0;
  private useTick = 0;

  constructor(private readonly store: AssetStore) {
    for (const z of FLOORS) {
      const ground = new Container();
      const objects = new Container();
      ground.sortableChildren = true;
      objects.sortableChildren = true;
      const container = new Container();
      container.addChild(ground, objects);
      this.container.addChild(container);
      this.floors.set(z, { container, ground, objects });
    }
  }

  /** Creatures remain attached to their authoritative floor. */
  creatureLayer(z: number): Container {
    const floor = this.floors.get(z);
    if (!floor) throw new Error(`map floor ${z} is out of range`);
    return floor.objects;
  }

  async setMap(name: string): Promise<void> {
    this.mapName = name;
    for (const sprites of this.dynamicTiles.values()) {
      for (const sprite of sprites) sprite.destroy();
    }
    this.dynamicTiles.clear();
    this.dynamicRequests.clear();
    const response = await fetch(`/assets/map/${name}/manifest.json`);
    if (!response.ok) throw new Error(`missing map manifest for ${name}`);
    this.manifest = (await response.json()) as MapManifest;
    for (const z of FLOORS) {
      const keys = new Set<string>();
      for (const [rx, ry] of this.manifest.regions[z] ?? []) {
        keys.add(`${rx},${ry}`);
      }
      this.available.set(z, keys);
    }
    this.refresh();
  }

  setCenter(x: number, y: number, z: number): void {
    this.center = { x, y, z };
    for (const [floorZ, floor] of this.floors) {
      const shift = (z - floorZ) * TILE_SIZE;
      floor.container.position.set(-shift, -shift);
    }
    this.refresh();
  }

  setViewRange(range: ViewRange): void {
    if (range.x === this.viewRange.x && range.y === this.viewRange.y) return;
    this.viewRange = { ...range };
    this.refresh();
  }

  async applyTileStates(
    visible: ReadonlyArray<TileState>,
    hidden: ReadonlyArray<Position>,
  ): Promise<void> {
    for (const position of hidden) {
      const key = `${position.z}:${position.x},${position.y}`;
      this.dynamicRequests.delete(key);
      for (const sprite of this.dynamicTiles.get(key) ?? []) sprite.destroy();
      this.dynamicTiles.delete(key);
    }
    for (const state of visible) {
      const key = `${state.position.z}:${state.position.x},${state.position.y}`;
      this.dynamicRequests.set(key, state);
    }
    const appearances = new Map<number, TibiaObject>();
    for (const state of visible) {
      for (const item of state.items) {
        appearances.set(item.itemId, this.store.item(item.itemId));
      }
    }
    await this.store.preload(
      [...appearances.values()].flatMap((object) => object.sprites),
    );
    for (const state of visible) {
      const key = `${state.position.z}:${state.position.x},${state.position.y}`;
      const objects = state.items.map((item) => this.store.item(item.itemId));
      if (this.dynamicRequests.get(key) !== state) continue;
      for (const sprite of this.dynamicTiles.get(key) ?? []) sprite.destroy();
      const floor = this.floors.get(state.position.z);
      if (!floor) continue;
      const sprites: Sprite[] = [];
      const hooks = {
        south: objects.some((object) => object.flags.hookSouth),
        east: objects.some((object) => object.flags.hookEast),
      };
      let elevation = 0;
      for (const ordered of getOrderedTileObjects(objects)) {
        this.drawPieces(
          ordered.object,
          state.position.x,
          state.position.y,
          state.position.z,
          ordered.ground ? floor.ground : floor.objects,
          sprites,
          getMapObjectZ(state.position.x, state.position.y, ordered.stack),
          elevation,
          hooks,
        );
        elevation = Math.min(
          MAX_ELEVATION,
          elevation + ordered.object.flags.elevation,
        );
      }
      this.dynamicTiles.set(key, sprites);
    }
  }

  /** Window center on a floor: higher floors draw shifted up-left, so the
   * tiles that appear over the viewport lie down-right of the camera. */
  private floorCenter(z: number): { x: number; y: number } {
    const shift = (this.center?.z ?? GROUND_FLOOR) - z;
    return { x: (this.center?.x ?? 0) + shift, y: (this.center?.y ?? 0) + shift };
  }

  private visibleFloors(): number[] {
    return getVisibleFloors(this.center?.z ?? GROUND_FLOOR);
  }

  private refresh(): void {
    if (!this.manifest || !this.center) return;
    const generation = ++this.generation;
    const size = this.manifest.regionSize;

    const needed = new Set<string>();
    const loads: Array<Promise<Region | null>> = [];
    const visibleFloors = this.visibleFloors();
    const windowX = this.viewRange.x + STATIC_TILE_MARGIN;
    const windowY = this.viewRange.y + STATIC_TILE_MARGIN;
    for (const z of visibleFloors) {
      const { x, y } = this.floorCenter(z);
      const firstRegionX = Math.floor((x - windowX) / size);
      const lastRegionX = Math.floor((x + windowX) / size);
      const firstRegionY = Math.floor((y - windowY) / size);
      const lastRegionY = Math.floor((y + windowY) / size);
      for (let regionY = firstRegionY; regionY <= lastRegionY; regionY++) {
        for (let regionX = firstRegionX; regionX <= lastRegionX; regionX++) {
          const key = `${z}:${regionX},${regionY}`;
          if (needed.has(key)) continue;
          needed.add(key);
          loads.push(this.loadRegion(key));
        }
      }
    }
    void Promise.all(loads).then(() => {
      if (generation !== this.generation) return;
      for (const z of visibleFloors) this.drawFloorWindow(z);
      for (const z of FLOORS) {
        if (!visibleFloors.includes(z)) this.clearFloorWindow(z);
      }
      this.applyCover();
      this.evictRegions(needed);
    });
  }

  private loadRegion(key: string): Promise<Region | null> {
    this.regionUse.set(key, ++this.useTick);
    const cached = this.regions.get(key);
    if (cached) return cached;
    const [z, regionKey] = key.split(":") as [string, string];
    if (!this.available.get(Number(z))?.has(regionKey)) {
      return Promise.resolve(null);
    }
    const promise = this.fetchRegion(Number(z), regionKey)
      .catch(() => {
        this.regions.delete(key);
        return null;
      })
      .then((region) => {
        this.loaded.set(key, region);
        return region;
      });
    this.regions.set(key, promise);
    return promise;
  }

  private async fetchRegion(z: number, regionKey: string): Promise<Region | null> {
    const size = this.manifest?.regionSize ?? 0;
    const [rx, ry] = regionKey.split(",").map(Number);
    const response = await fetch(
      `/assets/map/${this.mapName}/z${z}/${rx}.${ry}.json`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { tiles: number[][] };

    const tiles = new Map<number, number[]>();
    const itemIds = new Set<number>();
    for (const [dx = 0, dy = 0, ...ids] of data.tiles) {
      tiles.set(dy * size + dx, ids);
      for (const id of ids) itemIds.add(id);
    }
    const spriteIds: number[] = [];
    for (const id of itemIds) spriteIds.push(...this.store.item(id).sprites);
    await this.store.preload(spriteIds);
    return { tiles };
  }

  private drawFloorWindow(z: number): void {
    const { x: cx, y: cy } = this.floorCenter(z);
    const windowX = this.viewRange.x + STATIC_TILE_MARGIN;
    const windowY = this.viewRange.y + STATIC_TILE_MARGIN;
    const wanted = new Set<string>();
    for (let y = cy - windowY; y <= cy + windowY; y++) {
      for (let x = cx - windowX; x <= cx + windowX; x++) {
        const key = `${z}:${x},${y}`;
        wanted.add(key);
        if (!this.drawnTiles.has(key)) this.drawTile(z, x, y);
      }
    }
    for (const [key, sprites] of this.drawnTiles) {
      if (!key.startsWith(`${z}:`) || wanted.has(key)) continue;
      for (const sprite of sprites) sprite.destroy();
      this.drawnTiles.delete(key);
    }
  }

  private clearFloorWindow(z: number): void {
    for (const [key, sprites] of this.drawnTiles) {
      if (!key.startsWith(`${z}:`)) continue;
      for (const sprite of sprites) sprite.destroy();
      this.drawnTiles.delete(key);
    }
  }

  private tileIds(z: number, x: number, y: number): number[] | undefined {
    const size = this.manifest?.regionSize ?? 0;
    const region = this.loaded.get(
      `${z}:${Math.floor(x / size)},${Math.floor(y / size)}`,
    );
    return region?.tiles.get((y % size) * size + (x % size));
  }

  private drawTile(z: number, x: number, y: number): void {
    const floor = this.floors.get(z);
    const size = this.manifest?.regionSize ?? 0;
    const regionKey = `${z}:${Math.floor(x / size)},${Math.floor(y / size)}`;
    if (!floor || !this.loaded.has(regionKey)) return;
    const ids = this.tileIds(z, x, y);
    if (!ids) {
      this.drawnTiles.set(`${z}:${x},${y}`, []);
      return;
    }
    const sprites: Sprite[] = [];
    const objects = ids.map((id) => this.store.item(id));
    const hooks = {
      south: objects.some((object) => object.flags.hookSouth),
      east: objects.some((object) => object.flags.hookEast),
    };
    let elevation = 0;
    for (const ordered of getOrderedTileObjects(objects)) {
      this.drawPieces(
        ordered.object,
        x,
        y,
        z,
        ordered.ground ? floor.ground : floor.objects,
        sprites,
        getMapObjectZ(x, y, ordered.stack),
        elevation,
        hooks,
      );
      elevation = Math.min(
        MAX_ELEVATION,
        elevation + ordered.object.flags.elevation,
      );
    }
    this.drawnTiles.set(`${z}:${x},${y}`, sprites);
  }

  private drawPieces(
    o: TibiaObject,
    tileX: number,
    tileY: number,
    floor: number,
    layer: Container,
    sprites: Sprite[],
    zIndex: number,
    elevation: number,
    hooks: { south: boolean; east: boolean },
  ): void {
    const pattern = getMapItemPattern(o, tileX, tileY, floor, hooks);
    for (let itemLayer = 0; itemLayer < o.layers; itemLayer++) {
      for (let h = 0; h < o.height; h++) {
        for (let w = 0; w < o.width; w++) {
          const spriteId = this.store.spriteId(o, {
            ...pattern,
            w,
            h,
            l: itemLayer,
          });
          if (!spriteId) continue;
          const sprite = new Sprite(this.store.spriteTexture(spriteId));
          sprite.position.set(
            (tileX - w) * TILE_SIZE - o.flags.displacementX - elevation,
            (tileY - h) * TILE_SIZE - o.flags.displacementY - elevation,
          );
          sprite.zIndex = zIndex;
          layer.addChild(sprite);
          sprites.push(sprite);
        }
      }
    }
  }

  /** Hide only the floors blocked by a roof/wall over or beside the player. */
  private applyCover(): void {
    if (!this.center) return;
    const { x, y, z: playerFloor } = this.center;
    if (playerFloor > GROUND_FLOOR) {
      const visible = new Set(this.visibleFloors());
      for (const [z, floor] of this.floors) {
        floor.container.visible = visible.has(z);
      }
      return;
    }
    const firstVisibleFloor = getFirstVisibleFloor(
      x,
      y,
      playerFloor,
      (floor, tileX, tileY) => {
        const ids = this.tileIds(floor, tileX, tileY);
        return (
          ids !== undefined &&
          !ids.some((id) => this.store.item(id).flags.blockProjectile)
        );
      },
      (floor, tileX, tileY, freeView) =>
        this.tileIds(floor, tileX, tileY)?.some((id) => {
          const flags = this.store.item(id).flags;
          if (flags.dontHide) return false;
          return (
            flags.ground ||
            (flags.onBottom && (freeView || flags.blockProjectile))
          );
        }) ?? false,
    );
    for (const [z, floor] of this.floors) {
      floor.container.visible = z >= firstVisibleFloor && z <= GROUND_FLOOR;
    }
  }

  private evictRegions(needed: Set<string>): void {
    if (this.regions.size <= MAX_CACHED_REGIONS) return;
    const byAge = [...this.regions.keys()]
      .filter((key) => !needed.has(key))
      .sort((a, b) => (this.regionUse.get(a) ?? 0) - (this.regionUse.get(b) ?? 0));
    for (const key of byAge.slice(0, this.regions.size - MAX_CACHED_REGIONS)) {
      this.regions.delete(key);
      this.loaded.delete(key);
      this.regionUse.delete(key);
    }
  }
}
