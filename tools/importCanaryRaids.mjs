import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseCanaryRaid } from "./parseCanaryRaids.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(process.argv[2] ?? process.env.CANARY_PATH ?? "");
if (!process.argv[2] && !process.env.CANARY_PATH) {
  throw new Error("usage: node tools/importCanaryRaids.mjs <canary-checkout>");
}

const manifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const RAID_TREE = "data-otservbr-global/scripts/raids";

async function luaFiles(directory) {
  const found = [];
  for (const entry of (
    await readdir(directory, { withFileTypes: true })
  ).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await luaFiles(path)));
    else if (entry.name.endsWith(".lua")) found.push(path);
  }
  return found;
}

const raids = [];
const skipped = [];
const blobs = [];
for (const path of await luaFiles(join(sourceRoot, RAID_TREE))) {
  const relativePath = relative(sourceRoot, path).split("\\").join("/");
  const contents = await readFile(path, "utf8");
  blobs.push(
    `${createHash("sha256").update(contents).digest("hex")} ${relativePath}`,
  );
  const raid = parseCanaryRaid(relativePath, contents);
  if (!raid) {
    skipped.push({
      sourcePath: relativePath,
      status: "excluded",
      reason: "file declares no Raid()",
    });
    continue;
  }
  if (raid.unsupportedStages.length > 0) {
    skipped.push({
      sourcePath: relativePath,
      status: "deferred",
      reason: `unsupported stage methods: ${raid.unsupportedStages.join(", ")}`,
    });
    continue;
  }
  if (raid.stages.length === 0 || raid.areas.length === 0) {
    skipped.push({
      sourcePath: relativePath,
      status: "excluded",
      reason: "no zone area or no stages",
    });
    continue;
  }
  if (
    raid.targetChancePerDay === undefined ||
    raid.maxChancePerCheck === undefined
  ) {
    skipped.push({
      sourcePath: relativePath,
      status: "excluded",
      reason: "no roll chance configured, so Canary never starts it either",
    });
    continue;
  }
  const { unsupportedStages, ...definition } = raid;
  raids.push(definition);
}

if (raids.length === 0) throw new Error("no raids imported");
// `Raid:register()` writes into `Raid.registry[name]`, so a duplicated id in
// Canary means the later-loaded script wins and the earlier one never runs.
// Files load alphabetically, so the last parsed definition is the live one.
const byId = new Map();
for (const raid of raids) {
  const shadowed = byId.get(raid.id);
  if (shadowed) {
    skipped.push({
      sourcePath: shadowed.sourcePath,
      status: "excluded",
      reason: `raid id "${raid.id}" is re-registered by ${raid.sourcePath}, which shadows this definition in Canary too`,
    });
  }
  byId.set(raid.id, raid);
}
const placed = [...byId.values()].sort((left, right) =>
  left.id.localeCompare(right.id),
);

// Raid monsters the pinned creature import does not carry cannot spawn. They
// are reported rather than dropped, and the server-side parity test pins the
// budget so a newly missing name fails a test instead of silently vanishing.
const monsterTypes = JSON.parse(
  await readFile(join(repoRoot, "content/monsters/world-monsters.json"), "utf8"),
);
const knownMonsterNames = new Set(
  (monsterTypes.types ?? []).map((type) => type.name.toLowerCase()),
);
const unresolvedMonsterNames = [
  ...new Set(
    placed
      .flatMap((raid) => raid.stages)
      .filter((stage) => stage.kind === "spawn")
      .flatMap((stage) => stage.monsters)
      .map((monster) => monster.name)
      .filter((name) => !knownMonsterNames.has(name.toLowerCase())),
  ),
].sort();

const document = {
  formatVersion: manifest.converters.worldEvents,
  source: {
    repository: manifest.canary.repository,
    commit: manifest.canary.commit,
    tree: RAID_TREE,
    sourceTreeSha256: createHash("sha256")
      .update(blobs.sort().join("\n"))
      .digest("hex"),
  },
  counts: {
    imported: placed.length,
    skipped: skipped.length,
    unresolvedMonsterNames: unresolvedMonsterNames.length,
  },
  unresolvedMonsterNames,
  raids: placed,
  skipped: [...skipped].sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath),
  ),
};
await writeFile(
  join(repoRoot, "content/events/canary-raids.json"),
  `${JSON.stringify(document, null, 1)}\n`,
);
await writeFile(
  join(repoRoot, "server/data/raids.json"),
  `${JSON.stringify({
    formatVersion: document.formatVersion,
    mapName: "otservbr",
    raids: placed,
  })}\n`,
);
console.log(
  `imported ${placed.length} Canary raids (${skipped.length} classified as ` +
    `deferred/excluded, ${unresolvedMonsterNames.length} monster name(s) ` +
    `absent from the pinned creature import)`,
);
