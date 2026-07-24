import { Container, Sprite, Texture } from "pixi.js";
import type {
  MapItemState,
  Position,
  TileState,
  ViewRange,
} from "@tibia/protocol";
import type { AssetStore, TibiaObject } from "./AssetStore";
import { AnimatedMapItemRegistry } from "./AnimatedMapItemRegistry";
import { getFirstVisibleFloor } from "./getFirstVisibleFloor";
import { getMapRegionKeys } from "./getMapRegionKeys";
import { getItemInstanceSeed } from "./getItemInstanceSeed";
import { getMapItemPattern } from "./getMapItemPattern";
import { getMapSpritePosition } from "./getMapSpritePosition";
import { getMergedTileItems } from "./getMergedTileItems";
import { getTileLimitsFloorView } from "./getTileLimitsFloorView";
import {
  getTileRenderLayers,
  type LayeredTileObject,
  type TileRenderItem,
} from "./getTileRenderLayers";
import { getVisibleFloors } from "./getVisibleFloors";
import { projectFloorPosition } from "./projectFloorPosition";
import { resolveInteractiveTile } from "./resolveInteractiveTile";

const GROUND_FLOOR = 7;
const UNDERGROUND_FLOOR_AWARENESS = 2;
/** Draw deeper floors first so physically higher floors can cover them. */
const FLOORS = Array.from({ length: 16 }, (_, index) => 15 - index);
const STATIC_TILE_MARGIN = 2;
const MAX_CACHED_REGIONS = 48;

interface MapManifest {
  regionSize: number;
  version?: string;
  regions: Record<string, [number, number][]>;
}

interface Region {
  /** (dy * regionSize + dx) -> immutable ids in source stack order. */
  tiles: Map<number, number[]>;
}

interface FloorLayers {
  container: Container;
  ground: Container;
  objects: Container;
  transient: Container;
}

interface RenderedTile {
  sprites: Sprite[];
  animatedItemIds: string[];
}

/**
 * Streams the public static map, merges server-authorized mutable items, and
 * renders only the floor windows visible from the authoritative camera tile.
 */
export class MapView {
  readonly container = new Container();
  private readonly floors = new Map<number, FloorLayers>();
  private readonly animatedItems = new AnimatedMapItemRegistry();
  private manifest: MapManifest | null = null;
  private mapName = "";
  /** z -> region keys that exist on disk for that floor. */
  private readonly available = new Map<number, Set<string>>();
  private readonly regions = new Map<string, Promise<Region | null>>();
  private readonly loaded = new Map<string, Region | null>();
  private readonly regionUse = new Map<string, number>();
  private readonly drawnTiles = new Map<string, RenderedTile>();
  private readonly tileElevations = new Map<string, number>();
  private readonly dynamicRequests = new Map<string, TileState>();
  /** Optimistic per-tile projections; every authoritative tile state wins. */
  private readonly tileOverrides = new Map<string, TileState>();
  private center: Position | null = null;
  private viewRange: ViewRange = { x: 1, y: 1 };
  private generation = 0;
  private useTick = 0;
  /** Reports per-region completion of the current refresh batch. */
  onLoadProgress: ((completed: number, total: number) => void) | null = null;

  constructor(private readonly store: AssetStore) {
    for (const z of FLOORS) {
      const ground = new Container();
      const objects = new Container();
      const transient = new Container();
      ground.sortableChildren = true;
      objects.sortableChildren = true;
      const container = new Container();
      container.addChild(ground, objects, transient);
      this.container.addChild(container);
      this.floors.set(z, { container, ground, objects, transient });
    }
  }

  /** Creatures remain attached to their authoritative floor. */
  creatureLayer(z: number): Container {
    const floor = this.floors.get(z);
    if (!floor) throw new Error(`map floor ${z} is out of range`);
    return floor.objects;
  }

  /**
   * Short-lived effects/missiles/floating text attach here: it draws above
   * the floor's objects without forcing a re-sort of that layer per spawn.
   */
  effectLayer(z: number): Container {
    const floor = this.floors.get(z);
    if (!floor) throw new Error(`map floor ${z} is out of range`);
    return floor.transient;
  }

  isFloorVisible(z: number): boolean {
    return this.floors.get(z)?.container.visible ?? false;
  }

  isDynamicFloorVisible(z: number): boolean {
    if (!this.center || !this.isFloorVisible(z)) return false;
    return this.visibleFloors().includes(z);
  }

  projectPosition(x: number, y: number, z: number): { x: number; y: number } {
    return projectFloorPosition(x, y, this.center?.z ?? z, z);
  }

  /** Item ids on the tile in source stack order (ground first), for look. */
  lookItemIds(position: Position): number[] {
    return this.tileItems(position.z, position.x, position.y).map(
      (item) => item.object.clientId,
    );
  }

  /** Redirects a clicked tile to the anchor of a covering multi-tile sprite. */
  interactiveTileFor(position: Position): Position {
    return resolveInteractiveTile(position, (candidate) =>
      this.tileItems(candidate.z, candidate.x, candidate.y).map(
        ({ object }) => ({
          width: object.width,
          height: object.height,
          flags: object.flags,
        }),
      ),
    );
  }

  topServerItem(position: Position): MapItemState | undefined {
    const key = this.tileKey(position.z, position.x, position.y);
    return (this.tileOverrides.get(key) ?? this.dynamicRequests.get(key))
      ?.items.reduce<MapItemState | undefined>(
        (top, item) => (!top || item.stackIndex > top.stackIndex ? item : top),
        undefined,
      );
  }

  /** Optimistically hides a map item until the server confirms or rejects. */
  previewMapItemRemoval(position: Position, instanceId: string): void {
    const key = this.tileKey(position.z, position.x, position.y);
    const base = this.tileOverrides.get(key) ?? this.dynamicRequests.get(key);
    if (!base) return;
    this.tileOverrides.set(key, {
      ...base,
      items: base.items.filter((item) => item.instanceId !== instanceId),
    });
    this.redrawTileKey(key);
    this.applyCover();
  }

  /** Optimistically shows a map item until the server confirms or rejects. */
  async previewMapItemAddition(
    position: Position,
    item: Omit<MapItemState, "stackIndex">,
  ): Promise<void> {
    const key = this.tileKey(position.z, position.x, position.y);
    const base = this.tileOverrides.get(key) ??
      this.dynamicRequests.get(key) ?? {
        position: { ...position },
        revision: 0,
        items: [],
      };
    const stackIndex = base.items.reduce(
      (top, existing) => Math.max(top, existing.stackIndex + 1),
      0,
    );
    this.tileOverrides.set(key, {
      ...base,
      items: [
        ...base.items.filter(
          (existing) => existing.instanceId !== item.instanceId,
        ),
        { ...item, stackIndex },
      ],
    });
    await this.store.preload(this.store.item(item.itemId).sprites);
    if (this.tileOverrides.has(key)) {
      this.redrawTileKey(key);
      this.applyCover();
    }
  }

  /** Reverts every optimistic tile projection to the last server state. */
  clearMapItemPreviews(): void {
    if (this.tileOverrides.size === 0) return;
    const keys = [...this.tileOverrides.keys()];
    this.tileOverrides.clear();
    for (const key of keys) this.redrawTileKey(key);
    this.applyCover();
  }

  createItemDragCanvas(
    item: MapItemState,
    position: Position,
  ): HTMLCanvasElement {
    const object = this.store.item(item.itemId);
    const objects = this.tileItems(position.z, position.x, position.y).map(
      (tileItem) => tileItem.object,
    );
    const pattern = getMapItemPattern(
      object,
      position.x,
      position.y,
      position.z,
      {
        south: objects.some((tileObject) => tileObject.flags.hookSouth),
        east: objects.some((tileObject) => tileObject.flags.hookEast),
      },
    );
    return this.store.bakeFrame(object, { ...pattern, phase: 0 });
  }

  /** Interpolates visual elevation while a creature crosses a tile boundary. */
  elevationAt(z: number, x: number, y: number): number {
    const left = Math.floor(x);
    const top = Math.floor(y);
    const fractionX = x - left;
    const fractionY = y - top;
    const topLeft = this.tileElevation(z, left, top);
    const topRight = this.tileElevation(z, left + 1, top);
    const bottomLeft = this.tileElevation(z, left, top + 1);
    const bottomRight = this.tileElevation(z, left + 1, top + 1);
    const upper = topLeft + (topRight - topLeft) * fractionX;
    const lower = bottomLeft + (bottomRight - bottomLeft) * fractionX;
    return upper + (lower - upper) * fractionY;
  }

  tick(deltaMs: number): void {
    this.animatedItems.tick(deltaMs);
  }

  destroy(): void {
    this.clearRenderedTiles();
    this.animatedItems.clear();
    this.dynamicRequests.clear();
    this.tileOverrides.clear();
    this.regions.clear();
    this.loaded.clear();
    this.tileElevations.clear();
  }

  async setMap(name: string): Promise<void> {
    this.generation++;
    this.clearRenderedTiles();
    this.animatedItems.clear();
    this.dynamicRequests.clear();
    this.tileOverrides.clear();
    this.available.clear();
    this.regions.clear();
    this.loaded.clear();
    this.regionUse.clear();
    this.tileElevations.clear();
    this.mapName = name;
    // Revalidate the manifest on every login; its version then busts the
    // long-lived browser cache of region files whenever the map is rebuilt.
    const response = await fetch(`/assets/map/${name}/manifest.json`, {
      cache: "no-cache",
    });
    if (!response.ok) throw new Error(`missing map manifest for ${name}`);
    this.manifest = (await response.json()) as MapManifest;
    for (const z of FLOORS) {
      const keys = new Set<string>();
      for (const [rx, ry] of this.manifest.regions[z] ?? []) {
        keys.add(`${rx},${ry}`);
      }
      this.available.set(z, keys);
    }
    await this.refresh();
  }

  setCenter(x: number, y: number, z: number): void {
    const previousFloor = this.center?.z;
    this.center = { x, y, z };
    for (const [floorZ, floor] of this.floors) {
      const projected = projectFloorPosition(0, 0, z, floorZ);
      floor.container.position.set(projected.x, projected.y);
    }
    if (previousFloor !== undefined && previousFloor !== z) {
      const drawable = this.visibleFloors();
      for (const [key, state] of [...this.dynamicRequests]) {
        if (drawable.includes(state.position.z)) continue;
        this.dynamicRequests.delete(key);
        this.tileOverrides.delete(key);
        if (this.drawnTiles.has(key)) this.redrawTileKey(key);
      }
    }
    this.applyCover();
    void this.refresh();
  }

  async prefetchAt(position: Position): Promise<void> {
    if (!this.manifest) return;
    const keys = getMapRegionKeys(
      position,
      this.viewRange,
      this.manifest.regionSize,
      STATIC_TILE_MARGIN,
    );
    await Promise.all(keys.map((key) => this.loadRegion(key)));
    const protectedKeys = new Set(keys);
    if (this.center) {
      for (const key of getMapRegionKeys(
        this.center,
        this.viewRange,
        this.manifest.regionSize,
        STATIC_TILE_MARGIN,
      )) {
        protectedKeys.add(key);
      }
    }
    this.evictRegions(protectedKeys);
  }

  setViewRange(range: ViewRange): void {
    if (range.x === this.viewRange.x && range.y === this.viewRange.y) return;
    this.viewRange = { ...range };
    void this.refresh();
  }

  async applyTileStates(
    visible: ReadonlyArray<TileState>,
    hidden: ReadonlyArray<Position>,
  ): Promise<void> {
    const changed = new Set<string>();
    for (const position of hidden) {
      const key = this.tileKey(position.z, position.x, position.y);
      this.dynamicRequests.delete(key);
      this.tileOverrides.delete(key);
      changed.add(key);
    }
    for (const state of visible) {
      const key = this.tileKey(
        state.position.z,
        state.position.x,
        state.position.y,
      );
      this.dynamicRequests.set(key, state);
      this.tileOverrides.delete(key);
      changed.add(key);
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
    for (const key of changed) {
      if (!this.drawnTiles.has(key) && !this.isTileInWindow(key)) continue;
      this.redrawTileKey(key);
    }
    this.applyCover();
  }

  /** Higher floors are projected up-left, so their source window shifts down-right. */
  private floorCenter(z: number): { x: number; y: number } {
    const shift = (this.center?.z ?? GROUND_FLOOR) - z;
    return { x: (this.center?.x ?? 0) + shift, y: (this.center?.y ?? 0) + shift };
  }

  private visibleFloors(): number[] {
    return getVisibleFloors(this.center?.z ?? GROUND_FLOOR);
  }

  /** Resolves once the current window's regions (and their sheets) are drawn. */
  private refresh(): Promise<void> {
    if (!this.manifest || !this.center) return Promise.resolve();
    const generation = ++this.generation;
    const needed = new Set(
      getMapRegionKeys(
        this.center,
        this.viewRange,
        this.manifest.regionSize,
        STATIC_TILE_MARGIN,
      ),
    );
    const loads = [...needed].map((key) => this.loadRegion(key));
    const visibleFloors = this.visibleFloors();
    if (this.onLoadProgress && loads.length > 0) {
      let completed = 0;
      this.onLoadProgress(0, loads.length);
      for (const load of loads) {
        void load.then(() => {
          completed++;
          this.onLoadProgress?.(completed, loads.length);
        });
      }
    }
    return Promise.all(loads).then(() => {
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
      .catch(() => null)
      .then((region) => {
        if (this.regions.get(key) !== promise) return region;
        if (!region) {
          this.regions.delete(key);
          this.loaded.delete(key);
          return null;
        }
        this.loaded.set(key, region);
        this.invalidateRegion(key);
        return region;
      });
    this.regions.set(key, promise);
    return promise;
  }

  private async fetchRegion(z: number, regionKey: string): Promise<Region | null> {
    const size = this.manifest?.regionSize ?? 0;
    const version = this.manifest?.version;
    const [rx, ry] = regionKey.split(",").map(Number);
    const response = await fetch(
      `/assets/map/${this.mapName}/z${z}/${rx}.${ry}.json${
        version ? `?v=${version}` : ""
      }`,
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
    const { x: centerX, y: centerY } = this.floorCenter(z);
    const windowX = this.viewRange.x + STATIC_TILE_MARGIN;
    const windowY = this.viewRange.y + STATIC_TILE_MARGIN;
    const wanted = new Set<string>();
    for (let y = centerY - windowY; y <= centerY + windowY; y++) {
      for (let x = centerX - windowX; x <= centerX + windowX; x++) {
        const key = this.tileKey(z, x, y);
        wanted.add(key);
        if (!this.drawnTiles.has(key)) this.drawTile(z, x, y);
      }
    }
    for (const key of this.drawnTiles.keys()) {
      if (!key.startsWith(`${z}:`) || wanted.has(key)) continue;
      this.destroyRenderedTile(key);
    }
  }

  private clearFloorWindow(z: number): void {
    for (const key of this.drawnTiles.keys()) {
      if (key.startsWith(`${z}:`)) this.destroyRenderedTile(key);
    }
  }

  private staticItemIds(z: number, x: number, y: number): number[] {
    const size = this.manifest?.regionSize ?? 0;
    if (size === 0) return [];
    const region = this.loaded.get(
      `${z}:${Math.floor(x / size)},${Math.floor(y / size)}`,
    );
    const localX = ((x % size) + size) % size;
    const localY = ((y % size) + size) % size;
    return region?.tiles.get(localY * size + localX) ?? [];
  }

  private tileItems(z: number, x: number, y: number): TileRenderItem<TibiaObject>[] {
    const key = this.tileKey(z, x, y);
    const dynamicItems =
      !this.center || this.visibleFloors().includes(z)
        ? (this.tileOverrides.get(key) ?? this.dynamicRequests.get(key))
            ?.items ?? []
        : [];
    return getMergedTileItems(
      this.staticItemIds(z, x, y),
      dynamicItems,
      (itemId) => this.store.item(itemId),
      `${this.mapName}:${key}`,
    );
  }

  private tileElevation(z: number, x: number, y: number): number {
    const key = this.tileKey(z, x, y);
    const cached = this.tileElevations.get(key);
    if (cached !== undefined) return cached;
    const elevation = getTileRenderLayers(this.tileItems(z, x, y)).creatureElevation;
    this.tileElevations.set(key, elevation);
    return elevation;
  }

  private drawTile(z: number, x: number, y: number): void {
    const floor = this.floors.get(z);
    if (!floor) return;
    const key = this.tileKey(z, x, y);
    const items = this.tileItems(z, x, y);
    if (items.length === 0) {
      this.tileElevations.set(key, 0);
      this.drawnTiles.set(key, { sprites: [], animatedItemIds: [] });
      return;
    }

    const rendered: RenderedTile = { sprites: [], animatedItemIds: [] };
    const objects = items.map(({ object }) => object);
    const hooks = {
      south: objects.some((object) => object.flags.hookSouth),
      east: objects.some((object) => object.flags.hookEast),
    };
    const layers = getTileRenderLayers(items);
    this.tileElevations.set(key, layers.creatureElevation);
    for (const item of [...layers.beforeCreature, ...layers.topItems]) {
      this.drawItem(
        item,
        x,
        y,
        z,
        item.layer === "ground" ? floor.ground : floor.objects,
        rendered,
        hooks,
      );
    }
    this.drawnTiles.set(key, rendered);
  }

  private drawItem(
    item: LayeredTileObject<TibiaObject>,
    tileX: number,
    tileY: number,
    floor: number,
    layer: Container,
    rendered: RenderedTile,
    hooks: { south: boolean; east: boolean },
  ): void {
    const object = item.object;
    const pattern = getMapItemPattern(object, tileX, tileY, floor, hooks);
    const pieces: Array<{
      sprite: Sprite;
      w: number;
      h: number;
      itemLayer: number;
    }> = [];
    for (let itemLayer = 0; itemLayer < object.layers; itemLayer++) {
      for (let h = 0; h < object.height; h++) {
        for (let w = 0; w < object.width; w++) {
          const phaseIds = Array.from({ length: object.phases }, (_, phase) =>
            this.store.spriteId(object, {
              ...pattern,
              w,
              h,
              l: itemLayer,
              phase,
            }),
          );
          if (!phaseIds.some((spriteId) => spriteId > 0)) continue;
          const firstTexture = phaseIds[0]
            ? this.store.spriteTexture(phaseIds[0])
            : Texture.EMPTY;
          const sprite = new Sprite(firstTexture);
          const placement = getMapSpritePosition(
            tileX,
            tileY,
            w,
            h,
            object.flags.displacementX,
            object.flags.displacementY,
            item.elevationBefore,
            item.depth + itemLayer,
          );
          sprite.position.set(placement.x, placement.y);
          sprite.zIndex = placement.zIndex;
          layer.addChild(sprite);
          rendered.sprites.push(sprite);
          pieces.push({ sprite, w, h, itemLayer });
        }
      }
    }
    if (object.phases <= 1 || pieces.length === 0) return;

    rendered.animatedItemIds.push(item.instanceId);
    this.animatedItems.register({
      id: item.instanceId,
      floor,
      appearance: object,
      instanceSeed: getItemInstanceSeed(item.instanceId),
      applyPhase: (phase) => {
        for (const piece of pieces) {
          const spriteId = this.store.spriteId(object, {
            ...pattern,
            w: piece.w,
            h: piece.h,
            l: piece.itemLayer,
            phase,
          });
          piece.sprite.texture = spriteId
            ? this.store.spriteTexture(spriteId)
            : Texture.EMPTY;
        }
      },
    });
  }

  /** Hide only the floors blocked by a roof/wall over or beside the player. */
  private applyCover(): void {
    if (!this.center) return;
    const { x, y, z: playerFloor } = this.center;
    const lowestFloor =
      playerFloor > GROUND_FLOOR
        ? Math.max(GROUND_FLOOR + 1, playerFloor - UNDERGROUND_FLOOR_AWARENESS)
        : 0;
    const firstVisibleFloor = getFirstVisibleFloor(
      x,
      y,
      playerFloor,
      (floor, tileX, tileY) => {
        const items = this.tileItems(floor, tileX, tileY);
        return (
          items.length > 0 &&
          !items.some(({ object }) => object.flags.blockProjectile)
        );
      },
      (floor, tileX, tileY, freeView) =>
        getTileLimitsFloorView(
          this.tileItems(floor, tileX, tileY).map(({ object }) => object),
          freeView,
        ),
      lowestFloor,
    );
    const visible = new Set(
      this.visibleFloors().filter((floor) => floor >= firstVisibleFloor),
    );
    for (const [z, floor] of this.floors) {
      floor.container.visible = visible.has(z);
    }
    this.animatedItems.setVisibleFloors(visible);
  }

  private isTileInWindow(key: string): boolean {
    if (!this.center) return false;
    const [floorText, coordinates] = key.split(":") as [string, string];
    const [x, y] = coordinates.split(",").map(Number);
    const floor = Number(floorText);
    if (!this.visibleFloors().includes(floor)) return false;
    const center = this.floorCenter(floor);
    return (
      Math.abs(x - center.x) <= this.viewRange.x + STATIC_TILE_MARGIN &&
      Math.abs(y - center.y) <= this.viewRange.y + STATIC_TILE_MARGIN
    );
  }

  private redrawTileKey(key: string): void {
    this.destroyRenderedTile(key);
    if (!this.isTileInWindow(key)) return;
    const [floorText, coordinates] = key.split(":") as [string, string];
    const [x, y] = coordinates.split(",").map(Number);
    this.drawTile(Number(floorText), x, y);
  }

  private destroyRenderedTile(key: string): void {
    this.tileElevations.delete(key);
    const rendered = this.drawnTiles.get(key);
    if (!rendered) return;
    for (const id of rendered.animatedItemIds) this.animatedItems.unregister(id);
    for (const sprite of rendered.sprites) sprite.destroy();
    this.drawnTiles.delete(key);
  }

  private clearRenderedTiles(): void {
    for (const key of [...this.drawnTiles.keys()]) this.destroyRenderedTile(key);
  }

  private invalidateRegion(regionKey: string): void {
    const size = this.manifest?.regionSize ?? 0;
    if (size === 0) return;
    const [floorText, coordinates] = regionKey.split(":") as [string, string];
    const [regionX, regionY] = coordinates.split(",").map(Number);
    for (const key of [...this.drawnTiles.keys()]) {
      const [tileFloor, tileCoordinates] = key.split(":") as [string, string];
      if (tileFloor !== floorText) continue;
      const [x, y] = tileCoordinates.split(",").map(Number);
      if (
        Math.floor(x / size) === regionX &&
        Math.floor(y / size) === regionY
      ) {
        this.destroyRenderedTile(key);
      }
    }
  }

  private evictRegions(needed: Set<string>): void {
    if (this.regions.size <= MAX_CACHED_REGIONS) return;
    const byAge = [...this.regions.keys()]
      .filter((key) => !needed.has(key))
      .sort((left, right) =>
        (this.regionUse.get(left) ?? 0) - (this.regionUse.get(right) ?? 0),
      );
    for (const key of byAge.slice(0, this.regions.size - MAX_CACHED_REGIONS)) {
      this.regions.delete(key);
      this.loaded.delete(key);
      this.regionUse.delete(key);
    }
  }

  private tileKey(z: number, x: number, y: number): string {
    return `${z}:${x},${y}`;
  }
}
