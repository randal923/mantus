#!/usr/bin/env node
// Bakes minimap region tiles from the static map regions in
// client/public/assets/map/<name>/. For every region JSON a 256x256 PNG is
// written to client/public/assets/map/<name>/minimap/z<z>/<rx>.<ry>.png with
// one pixel per tile, using the classic Tibia automap palette: bright green
// grass, dark green trees, gray mountains, red-orange walls, blue water and
// yellow floor-changers. Because this asset era carries no automap-color
// attribute, each tile is classified from its item flags (ground, blocking,
// floorChange) plus the hue of the item's sprite sampled from the atlases,
// mirroring OTclient's "topmost automap color wins" rule.
//
//   yarn minimap:build
import { readFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "client/public/assets");
const MAPS_DIR = join(ASSETS, "map");

const REGION_FILE = /^(\d+)\.(\d+)\.json$/;
const FLOOR_DIR = /^z(\d+)$/;
/** Stack items covering less of the tile than this leave no minimap trace. */
const MIN_COVERAGE = 0.25;

/** Classic Tibia automap palette (216-color cube values). */
const AUTOMAP = {
  grass: [0, 204, 0],
  tree: [0, 102, 0],
  water: [51, 0, 204],
  ice: [204, 255, 255],
  snow: [255, 255, 255],
  dirt: [153, 102, 51],
  sand: [255, 204, 153],
  mountain: [102, 102, 102],
  pavement: [153, 153, 153],
  wall: [255, 51, 0],
  lava: [255, 102, 0],
  floorChange: [255, 255, 0],
};

function loadItems() {
  const data = JSON.parse(readFileSync(join(ASSETS, "objects.json"), "utf8"));
  const items = new Map();
  for (const object of data.objects) {
    if (object.category === "item") items.set(object.clientId, object);
  }
  return items;
}

function spriteSheet(index, spriteId) {
  return Math.floor((spriteId - 1) / index.tilesPerSheet);
}

/** Sprite ids that define an item's resting look: phase 0, pattern 0. */
function representativeSprites(item) {
  const count = item.width * item.height * item.layers;
  return item.sprites.slice(0, count).filter((id) => id > 0);
}

function collectUsedItemIds(mapDir, floors) {
  const used = new Set();
  for (const { dir, files } of floors) {
    for (const file of files) {
      const region = JSON.parse(readFileSync(join(dir, file), "utf8"));
      for (const tile of region.tiles) {
        for (let i = 2; i < tile.length; i++) used.add(tile[i]);
      }
    }
  }
  return used;
}

/** Mean RGB (alpha-weighted) and opaque coverage per sprite, sheet by sheet. */
async function sampleSpriteStats(index, spriteIds) {
  const bySheet = new Map();
  for (const id of spriteIds) {
    const sheet = spriteSheet(index, id);
    if (!bySheet.has(sheet)) bySheet.set(sheet, []);
    bySheet.get(sheet).push(id);
  }
  const stats = new Map();
  for (const [sheet, ids] of [...bySheet.entries()].sort((a, b) => a[0] - b[0])) {
    const { data, info } = await sharp(join(ASSETS, index.sheets[sheet]))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (const id of ids) {
      const cell = (id - 1) % index.tilesPerSheet;
      const left = (cell % index.cols) * index.cell + index.pad;
      const top = Math.floor(cell / index.cols) * index.cell + index.pad;
      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;
      for (let y = 0; y < index.tile; y++) {
        let offset = ((top + y) * info.width + left) * 4;
        for (let x = 0; x < index.tile; x++, offset += 4) {
          const a = data[offset + 3];
          if (a === 0) continue;
          r += data[offset] * a;
          g += data[offset + 1] * a;
          b += data[offset + 2] * a;
          alpha += a;
        }
      }
      stats.set(id, {
        r: alpha ? r / alpha : 0,
        g: alpha ? g / alpha : 0,
        b: alpha ? b / alpha : 0,
        coverage: alpha / (255 * index.tile * index.tile),
      });
    }
  }
  return stats;
}

/** Combine per-sprite stats into color + coverage + automap flags per item. */
function buildItemStats(items, usedIds, spriteStats) {
  const itemStats = new Map();
  for (const id of usedIds) {
    const item = items.get(id);
    if (!item) continue;
    let r = 0;
    let g = 0;
    let b = 0;
    let coverageSum = 0;
    for (const spriteId of representativeSprites(item)) {
      const s = spriteStats.get(spriteId);
      if (!s || s.coverage === 0) continue;
      r += s.r * s.coverage;
      g += s.g * s.coverage;
      b += s.b * s.coverage;
      coverageSum += s.coverage;
    }
    if (coverageSum === 0) continue;
    const flags = item.flags;
    itemStats.set(id, {
      r: r / coverageSum,
      g: g / coverageSum,
      b: b / coverageSum,
      // Coverage of the anchor tile, not the whole multi-tile footprint.
      coverage: Math.min(1, coverageSum / (item.width * item.height)),
      ground: Boolean(flags.ground || flags.fullGround),
      groundBorder: Boolean(flags.groundBorder),
      // Walls and fences carry the onBottom draw flag and block projectiles.
      wallLike: Boolean(flags.onBottom && flags.blockProjectile),
      obstacle: Boolean(
        flags.notWalkable || flags.notPathable || flags.blockProjectile,
      ),
      floorChange: Boolean(flags.floorChange),
    });
  }
  return itemStats;
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r / 255) h = ((g - b) / 255 / d) % 6;
  else if (max === g / 255) h = (b - r) / 255 / d + 2;
  else h = (r - g) / 255 / d + 4;
  h *= 60;
  return { h: h < 0 ? h + 360 : h, s, l };
}

/** Walkable terrain: pick the classic palette entry matching the hue. */
function classifyGround(stat) {
  const { h, s, l } = rgbToHsl(stat.r, stat.g, stat.b);
  if (s < 0.12) {
    if (l > 0.66) return AUTOMAP.snow;
    return l < 0.32 ? AUTOMAP.mountain : AUTOMAP.pavement;
  }
  if (h >= 60 && h < 170) return AUTOMAP.grass;
  if (h >= 170 && h < 270) {
    return l > 0.68 && s < 0.5 ? AUTOMAP.ice : AUTOMAP.water;
  }
  if (h >= 20 && h < 60) return l > 0.62 ? AUTOMAP.sand : AUTOMAP.dirt;
  if (h < 20 || h >= 330) {
    return s > 0.55 && l > 0.3 ? AUTOMAP.lava : AUTOMAP.dirt;
  }
  return AUTOMAP.mountain;
}

/** Non-wall obstacles: vegetation, rock, water features by sprite hue. */
function classifyObstacle(stat) {
  const { h, s, l } = rgbToHsl(stat.r, stat.g, stat.b);
  if (s < 0.14) return l > 0.66 ? AUTOMAP.snow : AUTOMAP.mountain;
  if (h >= 60 && h < 170) return AUTOMAP.tree;
  if (h >= 170 && h < 270) return AUTOMAP.water;
  return AUTOMAP.tree;
}

/** Trees carry no blocking flags in this DAT; spot them by size and hue. */
function isTreeLike(stat) {
  if (stat.coverage < 0.35) return false;
  const { h, s } = rgbToHsl(stat.r, stat.g, stat.b);
  return h >= 60 && h < 170 && s >= 0.14;
}

function tileColor(tile, itemStats) {
  let color = null;
  let floorChange = false;
  for (let i = 2; i < tile.length; i++) {
    const stat = itemStats.get(tile[i]);
    if (!stat) continue;
    if (stat.floorChange) floorChange = true;
    if (stat.ground) {
      color = classifyGround(stat);
      continue;
    }
    if (stat.wallLike && stat.coverage >= 0.15) {
      // Gray rock faces share the wall flags; only man-made walls go red.
      const { s } = rgbToHsl(stat.r, stat.g, stat.b);
      color = s < 0.12 ? AUTOMAP.mountain : AUTOMAP.wall;
      continue;
    }
    if (stat.obstacle && stat.coverage >= MIN_COVERAGE) {
      color = classifyObstacle(stat);
      continue;
    }
    if (isTreeLike(stat)) {
      color = AUTOMAP.tree;
      continue;
    }
    if (stat.groundBorder && !color) color = classifyGround(stat);
  }
  if (floorChange) return AUTOMAP.floorChange;
  return color;
}

async function renderRegion(sourcePath, outPath, regionSize, itemStats) {
  const region = JSON.parse(readFileSync(sourcePath, "utf8"));
  const pixels = Buffer.alloc(regionSize * regionSize * 4);
  let painted = 0;
  for (const tile of region.tiles) {
    const color = tileColor(tile, itemStats);
    if (!color) continue;
    const offset = (tile[1] * regionSize + tile[0]) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
    painted++;
  }
  if (painted === 0) return false;
  await sharp(pixels, {
    raw: { width: regionSize, height: regionSize, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  return true;
}

async function buildMap(name, items) {
  const mapDir = join(MAPS_DIR, name);
  const manifest = JSON.parse(
    readFileSync(join(mapDir, "manifest.json"), "utf8"),
  );
  const floors = readdirSync(mapDir)
    .map((entry) => FLOOR_DIR.exec(entry))
    .filter(Boolean)
    .map((match) => ({
      z: Number(match[1]),
      dir: join(mapDir, match[0]),
      files: readdirSync(join(mapDir, match[0])).filter((file) =>
        REGION_FILE.test(file),
      ),
    }));

  console.log(`[${name}] scanning ${floors.reduce((n, f) => n + f.files.length, 0)} regions…`);
  const usedIds = collectUsedItemIds(mapDir, floors);
  const knownIds = [...usedIds].filter((id) => items.has(id));
  console.log(
    `[${name}] ${usedIds.size} unique item ids (${usedIds.size - knownIds.length} missing from objects.json)`,
  );

  const spriteIds = new Set();
  for (const id of knownIds) {
    for (const spriteId of representativeSprites(items.get(id))) {
      spriteIds.add(spriteId);
    }
  }
  console.log(`[${name}] sampling ${spriteIds.size} sprites from the atlases…`);
  const spriteStats = await sampleSpriteStats(
    JSON.parse(readFileSync(join(ASSETS, "atlas-index.json"), "utf8")),
    spriteIds,
  );
  const itemStats = buildItemStats(items, usedIds, spriteStats);

  let written = 0;
  for (const { z, dir, files } of floors) {
    const outDir = join(mapDir, "minimap", `z${z}`);
    mkdirSync(outDir, { recursive: true });
    for (const file of files) {
      const outPath = join(outDir, file.replace(/\.json$/, ".png"));
      if (
        await renderRegion(
          join(dir, file),
          outPath,
          manifest.regionSize,
          itemStats,
        )
      ) {
        written++;
      }
    }
  }
  console.log(`[${name}] wrote ${written} minimap region tiles`);
}

const items = loadItems();
for (const name of readdirSync(MAPS_DIR)) {
  if (existsSync(join(MAPS_DIR, name, "manifest.json"))) {
    await buildMap(name, items);
  }
}
