import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  throw new Error("usage: node tools/importCanaryFoods.mjs <canary-checkout>");
}

const manifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const source = manifest.sources.canaryFoods;
const sourcePath = join(sourceRoot, source.path);
const contents = await readFile(sourcePath, "utf8");
const sha256 = createHash("sha256").update(contents).digest("hex");
if (sha256 !== source.sha256) {
  throw new Error("Canary food source does not match the pinned manifest");
}

const foods = {};
for (const match of contents.matchAll(
  /^\s*\[(\d+)\]\s*=\s*\{\s*(\d+),\s*"([^"]+)"\s*\}/gm,
)) {
  const itemTypeId = Number(match[1]);
  const foodUnits = Number(match[2]);
  const message = match[3];
  foods[itemTypeId] = {
    durationSeconds: foodUnits * 12,
    message,
  };
}
if (Object.keys(foods).length !== 133) {
  throw new Error(`expected 133 Canary foods, found ${Object.keys(foods).length}`);
}

await writeFile(
  join(repoRoot, "content/items/canary-foods.json"),
  `${JSON.stringify({
    formatVersion: manifest.converters.foods,
    source: {
      canaryCommit: source.commit,
      path: source.path,
      sha256,
    },
    foods,
  })}\n`,
);
console.log(`imported ${Object.keys(foods).length} Canary food definitions`);
