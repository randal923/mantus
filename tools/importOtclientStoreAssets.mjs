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
//   * `modules/game_shop/images/*.png` — 64×64 product art for the offers
//     that are services rather than items (Premium Time, XP Boost, name and
//     sex change, prey and hunting-task slots, prey wildcards, temple
//     teleport). Copied into `products/` under the symbol name the server's
//     catalog uses, so a symbol icon draws real art instead of a glyph.
//
// Usage: node tools/importOtclientStoreAssets.mjs [path-to-otclient-mehah]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const repoRoot = resolve(import.meta.dirname, "..");
const otclientRoot =
  process.argv[2] ?? resolve(repoRoot, "../otclient-mehah");
const sourceRoot = join(otclientRoot, "modules/game_store/images");
const shopRoot = join(otclientRoot, "modules/game_shop/images");
const outputRoot = join(repoRoot, "client/public/assets/store");

/** Whole files copied as-is. */
const FILES = {
  "home.png": "icon-store-home.png",
  "star.png": "icon-star-gold.png",
};

/**
 * Product art, keyed by the `symbol` a catalog icon names (see
 * `storeIconSchema` in protocol/src/store.ts). The `ex/` files are the
 * unnamed CipSoft store images game_shop bundles; which is which was settled
 * by eye against Canary's icon names (Permanent_Prey_Slot, Prey_Bonus_Reroll
 * — Canary's art for the Prey Wildcard offer — Permanent_Hunting_Task_Slot).
 */
const PRODUCT_FILES = {
  premium: "30_days.png",
  "exp-boost": "XP_Boost.png",
  "name-change": "Name_Change.png",
  "sex-change": "Sex_Change.png",
  "prey-wildcard": "ex/00045[64x64x8BPP].png",
  "prey-slot": "ex/00012[64x64x8BPP].png",
  hunting: "ex/00058[64x64x8BPP].png",
  temple: "Temple_Teleport.png",
};
const PRODUCT_SIZE = 64;

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
await mkdir(join(outputRoot, "products"), { recursive: true });

for (const [symbol, sourceName] of Object.entries(PRODUCT_FILES)) {
  const image = sharp(await readFile(join(shopRoot, sourceName)));
  const metadata = await image.metadata();
  if (metadata.width !== PRODUCT_SIZE || metadata.height !== PRODUCT_SIZE) {
    throw new Error(
      `${sourceName} is ${metadata.width}x${metadata.height}, expected ` +
        `${PRODUCT_SIZE}x${PRODUCT_SIZE}`,
    );
  }
  // Re-encoded rather than copied: the ex/ files are palette PNGs with
  // odd names, and a plain RGBA file is what the client should ship.
  await writeFile(
    join(outputRoot, "products", `${symbol}.png`),
    await image.ensureAlpha().png().toBuffer(),
  );
  console.log(`${sourceName} → store/products/${symbol}.png`);
}

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
