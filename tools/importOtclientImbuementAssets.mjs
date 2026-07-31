// Downloads the imbuement iconography from otclient into
// client/public/assets/imbuing. The icon ids are the same ones the server
// projects in `imbuement-window-state`: Canary's Imbuement::getIconID()
// returns `iconid + (baseid - 1)`, so Basic/Intricate/Powerful Scorch resolve
// to 13/14/15 and each lands on its own PNG here.
//
// Usage: node tools/importOtclientImbuementAssets.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const COMMIT = "465b7a217e87502bb7f9980bf6e099718d0a9a49";
const SOURCE_ROOT = `https://raw.githubusercontent.com/opentibiabr/otclient/${COMMIT}`;
const SOURCE_DIR = "data/images/game/imbuing";
/** icons/0.png is the placeholder otclient draws in an empty slot. */
const LAST_ICON_ID = 81;

const repoRoot = resolve(import.meta.dirname, "..");
const outputRoot = join(repoRoot, "client/public/assets/imbuing");
const assets = {
  "empty.png": `${SOURCE_DIR}/imbue_empty.png`,
  "slot.png": `${SOURCE_DIR}/slot.png`,
  "slot-inactive.png": `${SOURCE_DIR}/slot_inactive.png`,
  "slot-disabled.png": `${SOURCE_DIR}/slot_disabled.png`,
};
for (let iconId = 0; iconId <= LAST_ICON_ID; iconId += 1) {
  assets[`icons/${iconId}.png`] = `${SOURCE_DIR}/icons/${iconId}.png`;
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

console.log(`imported ${Object.keys(assets).length} imbuement assets`);
