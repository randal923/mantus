// Copies the Gem Atelier / Fragment Workshop art from a local checkout of
// mehah's otclient (data/images/game/wheel) into client/public/assets/wheel.
// The sheets are indexed by mod/gem ids — see protocol/src/gemAtelierMods.ts
// and client/lib/wheel/gemSheets.ts for the clip math.
//
// Usage: node tools/importWheelGemAssets.mjs [path/to/otclient-mehah]
import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const sourceRoot = join(
  process.argv[2] ?? resolve(repoRoot, "../otclient-mehah"),
  "data/images/game/wheel",
);
const outputRoot = join(repoRoot, "client/public/assets/wheel");

const assets = [
  "icons-gematelier-gemvariants.png",
  "icons-gematelier-gemvariants64.png",
  "icons-gematelier-domainaffinity.png",
  "icons-skillwheel-basicmods.png",
  "icons-skillwheel-suprememods.png",
  "backdrop_modgrades.png",
  "backdrop_skillwheel_socket_active.png",
  "backdrop_skillwheel_socket_inactive.png",
  "fragmentIcon.png",
  "socket-gematelier.png",
  "icon-gematelier.png",
  "icon-locked.png",
  "icon-unlocked.png",
  "icon-socketed.png",
  "icon-modgrade1.png",
  "icon-modgrade2.png",
  "icon-modgrade3.png",
  "icon-modgrade4.png",
];

await mkdir(outputRoot, { recursive: true });
for (const name of assets) {
  await copyFile(join(sourceRoot, name), join(outputRoot, name));
  console.log(`copied ${name}`);
}
