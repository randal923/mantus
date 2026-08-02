import { Texture } from "pixi.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetStore } from "./AssetStore";

const VERSION = "deadbeefcafe0001";

const atlasIndex = {
  tile: 32,
  pad: 0,
  cell: 32,
  sheetPx: 4096,
  cols: 128,
  rows: 128,
  tilesPerSheet: 16384,
  sheetCount: 1,
  spriteCount: 1,
  sheets: ["atlas-0.png"],
};

const objectsFile = {
  objects: [
    {
      category: "item",
      clientId: 100,
      width: 1,
      height: 1,
      layers: 1,
      px: 0,
      py: 0,
      pz: 0,
      phases: 1,
      flags: { ground: false, groundSpeed: 0 },
      sprites: [1],
    },
  ],
};

const outfitColors: number[][] = [[255, 255, 255]];

const okResponse = (body: unknown) => ({
  ok: true,
  json: async () => body,
  blob: async () => new Blob(),
});

// Routes every asset the store fetches; `manifestOk: false` simulates an
// absent manifest (old deploy) while still serving the rest.
const route = (url: string, manifestOk = true) => {
  const path = url.split("?")[0];
  if (path.endsWith("/manifest.json")) {
    return manifestOk ? okResponse({ version: VERSION }) : { ok: false };
  }
  if (path.endsWith("/atlas-index.json")) return okResponse(atlasIndex);
  if (path.endsWith("/objects.json")) return okResponse(objectsFile);
  if (path.endsWith("/outfit-colors.json")) return okResponse(outfitColors);
  if (path.endsWith(".png")) return okResponse(null);
  return { ok: false };
};

describe("AssetStore cache-busting", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({}) as ImageBitmap));
    vi.spyOn(Texture, "from").mockReturnValue({
      source: { scaleMode: "nearest" },
    } as unknown as Texture);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const urlsFetched = () => fetchMock.mock.calls.map((call) => String(call[0]));

  it("appends the manifest version to objects.json, atlas-index.json, and sheets", async () => {
    fetchMock.mockImplementation(async (url: string) => route(url));

    const store = new AssetStore();
    await store.load();
    await store.preload([1]);

    const urls = urlsFetched();
    expect(urls).toContain(`/assets/objects.json?v=${VERSION}`);
    expect(urls).toContain(`/assets/atlas-index.json?v=${VERSION}`);
    expect(urls).toContain(`/assets/atlas-0.png?v=${VERSION}`);
    // outfit-colors.json is not part of the dat/spr bundle — left unversioned.
    expect(urls).toContain(`/assets/outfit-colors.json`);
  });

  it("fetches the manifest with cache: no-cache before the catalog", async () => {
    fetchMock.mockImplementation(async (url: string) => route(url));

    const store = new AssetStore();
    await store.load();

    const manifestCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/manifest.json"),
    );
    expect(manifestCall).toBeDefined();
    expect(manifestCall?.[1]).toMatchObject({ cache: "no-cache" });
    // Manifest must be revalidated before the catalog files it versions.
    const order = urlsFetched();
    const manifestIndex = order.findIndex((url) => url.includes("/manifest.json"));
    const objectsIndex = order.findIndex((url) => url.includes("/objects.json"));
    expect(manifestIndex).toBeGreaterThanOrEqual(0);
    expect(manifestIndex).toBeLessThan(objectsIndex);
  });

  it("falls back to unversioned URLs when the manifest is missing", async () => {
    fetchMock.mockImplementation(async (url: string) => route(url, false));

    const store = new AssetStore();
    await store.load();
    await store.preload([1]);

    const urls = urlsFetched();
    expect(urls).toContain(`/assets/objects.json`);
    expect(urls).toContain(`/assets/atlas-0.png`);
    expect(urls.some((url) => url.includes("?v="))).toBe(false);
  });

  it("retries one failed atlas sheet load for every waiting creature", async () => {
    let sheetAttempts = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.split("?")[0]?.endsWith(".png")) {
        sheetAttempts += 1;
        if (sheetAttempts === 1) return { ok: false };
      }
      return route(url);
    });

    const store = new AssetStore();
    await store.load();
    await expect(
      Promise.all([store.preload([1]), store.preload([1])]),
    ).resolves.toEqual([undefined, undefined]);

    expect(sheetAttempts).toBe(2);
  });
});
