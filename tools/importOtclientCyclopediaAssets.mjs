import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const COMMIT = "465b7a217e87502bb7f9980bf6e099718d0a9a49";
const SOURCE_ROOT = `https://raw.githubusercontent.com/opentibiabr/otclient/${COMMIT}`;
const repoRoot = resolve(import.meta.dirname, "..");
const outputRoot = join(repoRoot, "client/public/assets/cyclopedia");
const assets = {
  "tabs/items.png": "data/images/game/cyclopedia/items_on.png",
  "tabs/bestiary.png": "data/images/game/cyclopedia/bestiary_on.png",
  "tabs/bosstiary.png": "data/images/game/cyclopedia/bosstiary_on.png",
  "currency/charm.png": "modules/game_cyclopedia/images/bestiary/charm.png",
  "currency/gold.png": "modules/game_cyclopedia/images/icon-goldcoin.png",
  "stats/hitpoints.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-hitpoints.png",
  "stats/experience.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-experience.png",
  "stats/armor.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-armor.png",
  "stats/speed.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-speed.png",
  "stats/mitigation.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-mitigation.png",
  "stats/bonus-points.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-bonuspoints.png",
  "resistances/physical.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-physical-resist.png",
  "resistances/energy.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-energy-resist.png",
  "resistances/earth.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-earth-resist.png",
  "resistances/fire.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-fire-resist.png",
  "resistances/ice.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-ice-resist.png",
  "resistances/holy.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-holy-resist.png",
  "resistances/death.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-death-resist.png",
  "resistances/healing.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-healing-resist.png",
  "resistances/life-drain.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-lifedrain-resist.png",
  "resistances/mana-drain.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-manadrain-resist.png",
  "resistances/drown.png": "modules/game_cyclopedia/images/bestiary/icons/monster-icon-drowning-resist.png",
  "boss/bane.png": "modules/game_cyclopedia/images/boss/icon_bane.png",
  "boss/archfoe.png": "modules/game_cyclopedia/images/boss/icon_archfoe.png",
  "boss/nemesis.png": "modules/game_cyclopedia/images/boss/icon_nemesis.png",
  "boss/star-active.png": "modules/game_cyclopedia/images/boss/icon_star_active.png",
  "boss/star-inactive.png": "modules/game_cyclopedia/images/boss/icon_star_inactive.png",
  "boss/star-bronze.png": "modules/game_cyclopedia/images/boss/icon_star_bronze.png",
  "boss/star-silver.png": "modules/game_cyclopedia/images/boss/icon_star_silver.png",
  "boss/star-gold.png": "modules/game_cyclopedia/images/boss/icon_star_gold.png",
};
const classes = [
  "amphibic",
  "aquatic",
  "bird",
  "construct",
  "demon",
  "dragon",
  "elemental",
  "extra_dimensional",
  "fey",
  "giant",
  "human",
  "humanoid",
  "inkborn",
  "lycanthrope",
  "magical",
  "mammal",
  "plant",
  "reptile",
  "slime",
  "undead",
  "vermin",
];
for (const className of classes) {
  assets[`classes/${className}.png`] =
    `modules/game_cyclopedia/images/bestiary/creatures/${className}.png`;
}

for (const [outputPath, sourcePath] of Object.entries(assets)) {
  const response = await fetch(`${SOURCE_ROOT}/${sourcePath}`);
  if (!response.ok) {
    throw new Error(`failed to download ${sourcePath}: ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    throw new Error(`downloaded asset ${sourcePath} is not a PNG`);
  }
  const destination = join(outputRoot, outputPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

console.log(`imported ${Object.keys(assets).length} Cyclopedia assets`);
