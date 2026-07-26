// Imports the achievement catalog from a pinned Canary checkout into
// content/profile/canary-achievements.json. Canary Lua is read as text and is
// never loaded or executed. Each entry gets a deterministic kebab-case slug;
// the slugs are durable grant keys (they end up in character_achievements
// rows), so any change to the slugging rules is a format-version bump.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseCanaryAchievements } from "./parseCanaryAchievements.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const canaryRoot = process.argv[2] ?? process.env.CANARY_PATH;
if (!canaryRoot) {
  throw new Error(
    "usage: node tools/importCanaryAchievements.mjs <pinned-canary-checkout>",
  );
}

// Slugs already claimed by the hand-pinned mantus catalog
// (server/src/profile/achievementCatalog.ts); a Canary entry may never shadow
// one. The loader re-asserts this at boot.
const RESERVED_SLUGS = new Set([
  "first-steps",
  "seasoned-traveller",
  "veteran",
  "living-legend",
  "landlord",
  "big-spender",
  "guild-founder",
]);

const EXPECTED_ENTRY_COUNT = 541;
const MAX_DESCRIPTION_LENGTH = 512;

const manifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
if (manifest.converters.achievements !== 1) {
  throw new Error("manifest converters.achievements is not version 1");
}
const commit = execFileSync("git", ["-C", canaryRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (commit !== manifest.canary.commit) {
  throw new Error(
    `Canary checkout is ${commit}, expected ${manifest.canary.commit}`,
  );
}

const source = manifest.sources.canaryAchievements;
const luaSource = await readFile(join(canaryRoot, source.path), "utf8");
const sha256 = createHash("sha256").update(luaSource).digest("hex");
if (sha256 !== source.sha256) {
  throw new Error(`${source.path} does not match the pinned manifest`);
}

function slugOf(name) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length === 0 || slug.length > 64) {
    throw new Error(`achievement name ${name} produces unusable slug`);
  }
  return slug;
}

const parsed = parseCanaryAchievements(luaSource);
if (parsed.length !== EXPECTED_ENTRY_COUNT) {
  throw new Error(
    `parsed ${parsed.length} achievements, expected ${EXPECTED_ENTRY_COUNT}`,
  );
}
const seenSlugs = new Set();
const achievements = parsed.map((entry) => {
  const slug = slugOf(entry.name);
  if (seenSlugs.has(slug)) {
    throw new Error(`achievement slug collision: ${slug}`);
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`achievement slug shadows a pinned mantus id: ${slug}`);
  }
  if (entry.description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      `achievement ${slug} description exceeds ${MAX_DESCRIPTION_LENGTH} characters`,
    );
  }
  seenSlugs.add(slug);
  return { slug, ...entry };
});

const document = {
  formatVersion: manifest.converters.achievements,
  source: { canaryCommit: source.commit, path: source.path, sha256 },
  achievements,
};
const outDir = join(repoRoot, "content/profile");
const outPath = join(outDir, "canary-achievements.json");
await mkdir(outDir, { recursive: true });
const staging = `${outPath}.tmp`;
await writeFile(staging, `${JSON.stringify(document, null, 1)}\n`);
await rename(staging, outPath);
console.log(`imported ${achievements.length} Canary achievements`);
