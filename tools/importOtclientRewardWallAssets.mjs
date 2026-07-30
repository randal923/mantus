// Imports the reward-wall art OTClient ships into
// client/public/assets/reward-wall/.
//
// The window in `client/components/daily/` is built from these pieces, which
// are the same ones the official client draws:
//
//   * `icon-restingareabonuseslevels.png` — a 384x64 strip of the six resting
//     area shields, one per streak bonus, sliced here into `bonus-1..6.png`.
//   * `rewardButton.png` — two stacked 66x20 plates: the red padlock a locked
//     day shows and the green check a collected one shows.
//   * `icon-rewardarrow.png` — 10x7, two stacked 5x7 arrow states (grey then
//     green) drawn between the seven days.
//   * `icon-rewardstreak-*.png` — the streak banner, one per tier
//     (default/bronze/silver/gold; game_rewardwall.lua:219-222).
//   * `icon-reward-{pickitems,fixeditems,xpboost}.png` — the day's reward type.
//   * `icon-daily-reward-joker.png`, `icon-banner-premium.png`,
//     `ditherpattern.png` — the joker token, the premium badge, and the
//     overlay that dims a day the player cannot claim.
//
// Usage: node tools/importOtclientRewardWallAssets.mjs [path-to-otclient-mehah]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const repoRoot = resolve(import.meta.dirname, "..");
const otclientRoot =
  process.argv[2] ?? resolve(repoRoot, "../otclient-mehah");
const sourceRoot = join(otclientRoot, "modules/game_rewardwall/images");
const outputRoot = join(repoRoot, "client/public/assets/reward-wall");

/** Whole files copied as-is. */
const FILES = {
  "streak-default.png": "icon-rewardstreak-default.png",
  "streak-bronze.png": "icon-rewardstreak-bronze.png",
  "streak-silver.png": "icon-rewardstreak-silver.png",
  "streak-gold.png": "icon-rewardstreak-gold.png",
  "reward-pickitems.png": "icon-reward-pickitems.png",
  "reward-fixeditems.png": "icon-reward-fixeditems.png",
  "reward-xpboost.png": "icon-reward-xpboost.png",
  "arrow.png": "icon-rewardarrow.png",
  "joker.png": "icon-daily-reward-joker.png",
  "premium-badge.png": "icon-banner-premium.png",
  "dither.png": "ditherpattern.png",
};

/** Regions cut out of a larger sheet. */
const SLICES = [
  {
    source: "rewardButton.png",
    cells: [
      { name: "day-locked.png", left: 0, top: 0, width: 66, height: 20 },
      { name: "day-done.png", left: 0, top: 20, width: 66, height: 20 },
    ],
  },
  {
    source: "icon-restingareabonuseslevels.png",
    // Six 64x64 shields, in streak order: the first is the level-2 hit point
    // bonus and the last the level-7 soul bonus.
    cells: Array.from({ length: 6 }, (_, index) => ({
      name: `bonus-${index + 1}.png`,
      left: index * 64,
      top: 0,
      width: 64,
      height: 64,
    })),
  },
];

await mkdir(outputRoot, { recursive: true });

for (const [outputName, sourceName] of Object.entries(FILES)) {
  const bytes = await readFile(join(sourceRoot, sourceName));
  await writeFile(join(outputRoot, outputName), bytes);
}

for (const { source, cells } of SLICES) {
  const sheet = await readFile(join(sourceRoot, source));
  for (const cell of cells) {
    await sharp(sheet)
      .extract({
        left: cell.left,
        top: cell.top,
        width: cell.width,
        height: cell.height,
      })
      .toFile(join(outputRoot, cell.name));
  }
}

const written =
  Object.keys(FILES).length +
  SLICES.reduce((total, slice) => total + slice.cells.length, 0);
console.log(`reward wall: wrote ${written} images to ${outputRoot}`);
