import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  IMPLEMENTED_CHEST_UID_RANGES,
  IMPLEMENTED_ITEM_IDS,
  classifyWorldActionRegistration,
} from "./classifyWorldActionRegistration.mjs";
import { parseCanaryActionRegistrations } from "./parseCanaryActionRegistrations.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(process.argv[2] ?? process.env.CANARY_PATH ?? "");
if (!process.argv[2] && !process.env.CANARY_PATH) {
  throw new Error(
    "usage: node tools/buildWorldActionParityInventory.mjs <canary-checkout>",
  );
}

const manifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);

/**
 * The registration trees todo-13 owns, plus the scripted quest tree: quest
 * scripts classify deferred wholesale (todo-20 quest storage) except the
 * entries the quest-touch table reproduces, which need to appear here to be
 * marked implemented.
 */
const TREES = [
  "data/scripts/actions",
  "data/scripts/movements",
  "data/scripts/creaturescripts",
  "data-otservbr-global/scripts/actions",
  "data-otservbr-global/scripts/movements",
  "data-otservbr-global/scripts/creaturescripts",
  "data-otservbr-global/scripts/quests",
];

async function luaFiles(directory) {
  const found = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await luaFiles(path)));
    else if (entry.name.endsWith(".lua")) found.push(path);
  }
  return found;
}

const entries = [];
const blobs = [];
for (const tree of TREES) {
  for (const path of await luaFiles(join(sourceRoot, tree))) {
    const relativePath = relative(sourceRoot, path).split("\\").join("/");
    const contents = await readFile(path, "utf8");
    blobs.push(
      `${createHash("sha256").update(contents).digest("hex")} ${relativePath}`,
    );
    for (const registration of parseCanaryActionRegistrations(
      relativePath,
      contents,
    )) {
      const disposition = classifyWorldActionRegistration(registration);
      entries.push({ ...registration, ...disposition });
    }
  }
}

if (entries.length === 0) throw new Error("no registrations parsed");
const unclassified = entries.filter((entry) => entry.status === "unclassified");
const counts = {
  registrations: entries.length,
  implemented: entries.filter((entry) => entry.status === "implemented").length,
  deferred: entries.filter((entry) => entry.status === "deferred").length,
  excluded: entries.filter((entry) => entry.status === "excluded").length,
  unclassified: unclassified.length,
};

await writeFile(
  join(repoRoot, "content/canary-world-action-parity.json"),
  `${JSON.stringify(
    {
      formatVersion: manifest.converters.worldActionParity,
      source: {
        repository: manifest.canary.repository,
        commit: manifest.canary.commit,
        trees: TREES,
        sourceTreeSha256: createHash("sha256")
          .update(blobs.sort().join("\n"))
          .digest("hex"),
      },
      counts,
      implementedItemIds: IMPLEMENTED_ITEM_IDS,
      implementedChestUidRanges: IMPLEMENTED_CHEST_UID_RANGES,
      registrations: entries,
    },
    null,
    1,
  )}\n`,
);
console.log(
  `classified ${counts.registrations} world-action registrations: ` +
    `${counts.implemented} implemented, ${counts.deferred} deferred, ` +
    `${counts.excluded} excluded, ${counts.unclassified} unclassified`,
);
if (unclassified.length > 0) {
  for (const entry of unclassified.slice(0, 20)) {
    console.warn(`unclassified: ${entry.sourcePath} (${entry.name})`);
  }
}
