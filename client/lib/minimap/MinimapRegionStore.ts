interface MinimapManifest {
  regionSize: number;
  regions: Record<string, [number, number][]>;
}

const MAX_CACHED_IMAGES = 96;

/**
 * Lazily fetches the pre-baked minimap region tiles
 * (`/assets/map/<name>/minimap/z<z>/<rx>.<ry>.png`, one pixel per tile).
 * `onUpdate` fires whenever a newly decoded region becomes drawable.
 */
export class MinimapRegionStore {
  /** z -> "rx.ry" region keys that exist for that floor. */
  private readonly available = new Map<number, Set<string>>();
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly pending = new Set<string>();
  private readonly missing = new Set<string>();
  private readonly lastUse = new Map<string, number>();
  private regionSizeValue = 256;
  private useTick = 0;
  private disposed = false;

  constructor(
    private readonly mapName: string,
    private readonly onUpdate: () => void,
  ) {}

  async load(): Promise<boolean> {
    this.disposed = false;
    try {
      const response = await fetch(`/assets/map/${this.mapName}/manifest.json`);
      if (!response.ok || this.disposed) return false;
      const manifest = (await response.json()) as MinimapManifest;
      if (this.disposed) return false;
      this.regionSizeValue = manifest.regionSize;
      for (const [z, regions] of Object.entries(manifest.regions)) {
        this.available.set(
          Number(z),
          new Set(regions.map(([rx, ry]) => `${rx}.${ry}`)),
        );
      }
      this.onUpdate();
      return true;
    } catch {
      return false;
    }
  }

  dispose(): void {
    this.disposed = true;
  }

  get regionSize(): number {
    return this.regionSizeValue;
  }

  /** Returns the decoded region image, or null while absent or loading. */
  regionImage(z: number, rx: number, ry: number): HTMLImageElement | null {
    const region = `${rx}.${ry}`;
    if (!this.available.get(z)?.has(region)) return null;
    const key = `${z}/${region}`;
    const image = this.images.get(key);
    if (image) {
      this.lastUse.set(key, ++this.useTick);
      return image;
    }
    if (this.pending.has(key) || this.missing.has(key)) return null;
    this.pending.add(key);
    const loading = new Image();
    loading.src = `/assets/map/${this.mapName}/minimap/z${z}/${region}.png`;
    loading
      .decode()
      .then(() => {
        this.pending.delete(key);
        if (this.disposed) return;
        this.images.set(key, loading);
        this.lastUse.set(key, ++this.useTick);
        this.evict();
        this.onUpdate();
      })
      .catch(() => {
        // Regions with no painted tiles have no baked image.
        this.pending.delete(key);
        this.missing.add(key);
      });
    return null;
  }

  private evict(): void {
    while (this.images.size > MAX_CACHED_IMAGES) {
      let oldestKey: string | null = null;
      let oldestUse = Infinity;
      for (const [key, use] of this.lastUse) {
        if (use < oldestUse) {
          oldestUse = use;
          oldestKey = key;
        }
      }
      if (!oldestKey) return;
      this.images.delete(oldestKey);
      this.lastUse.delete(oldestKey);
    }
  }
}
