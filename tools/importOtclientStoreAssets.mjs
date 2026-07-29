// Imports the store art OTClient actually ships into
// client/public/assets/store/.
//
// OTClient does *not* bundle CipSoft's `Category_*.png` pack — it downloads
// those from CipSoft's CDN at runtime (game_store.lua's `setImagenHttp`), so
// they are not ours to redistribute. What it does bundle, and what carries
// the store's real look, is:
//
//   * `store-icons-inline.png` — the 13x13 strip behind every `{character}`,
//     `{storeinbox}`, `{speedboost}`… tag in Canary's offer descriptions.
//     Sliced here into named files so the description renderer can draw the
//     same icons the official client draws.
//   * `icon-store-home.png` / `icon-star-gold.png` — the Home category icon
//     and the featured-offer star.
//
// Usage: node tools/importOtclientStoreAssets.mjs [path-to-otclient-mehah]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const repoRoot = resolve(import.meta.dirname, "..");
const otclientRoot =
  process.argv[2] ?? resolve(repoRoot, "../otclient-mehah");
const sourceRoot = join(otclientRoot, "modules/game_store/images");
const outputRoot = join(repoRoot, "client/public/assets/store");

/** Whole files copied as-is. */
const FILES = {
  "home.png": "icon-store-home.png",
  "star.png": "icon-star-gold.png",
};

/**
 * The inline strip's 13x13 cells, in the order game_store.lua clips them.
 * Names match the Canary description tag they render.
 */
const INLINE_ICONS = [
  "info",
  "character",
  "usablebyall",
  "box",
  "storeinbox",
  "house",
  "once",
  "backtoinbox",
  "vocationlevelcheck",
  "speedboost",
  "activated",
  "battlesign",
  "capacity",
  "use",
  "transferableprice",
];
const CELL = 13;

await mkdir(join(outputRoot, "tags"), { recursive: true });

for (const [outputName, sourceName] of Object.entries(FILES)) {
  const bytes = await readFile(join(sourceRoot, sourceName));
  await writeFile(join(outputRoot, outputName), bytes);
  console.log(`${sourceName} → store/${outputName}`);
}

const stripPath = join(sourceRoot, "store-icons-inline.png");
const strip = sharp(await readFile(stripPath));
const { width, height } = await strip.metadata();
if (height !== CELL) {
  throw new Error(`store-icons-inline.png is ${height}px tall, expected ${CELL}`);
}
const cells = Math.floor(width / CELL);
if (cells < INLINE_ICONS.length) {
  throw new Error(
    `store-icons-inline.png has ${cells} cells, fewer than the ` +
      `${INLINE_ICONS.length} this importer names`,
  );
}

for (const [index, name] of INLINE_ICONS.entries()) {
  const cell = await sharp(await readFile(stripPath))
    .extract({ left: index * CELL, top: 0, width: CELL, height: CELL })
    .png()
    .toBuffer();
  await writeFile(join(outputRoot, "tags", `${name}.png`), cell);
}
console.log(
  `store-icons-inline.png → store/tags/ (${INLINE_ICONS.length} of ${cells} cells)`,
);
