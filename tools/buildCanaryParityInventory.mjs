import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const canaryRoot = resolve(process.argv[2] ?? process.env.CANARY_PATH ?? "");
if (!process.argv[2] && !process.env.CANARY_PATH) {
  throw new Error(
    "usage: node tools/buildCanaryParityInventory.mjs <pinned-canary-checkout>",
  );
}

const manifest = JSON.parse(
  readFileSync(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const commit = execFileSync("git", ["-C", canaryRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (commit !== manifest.canary?.commit) {
  throw new Error(`Canary checkout is ${commit}, expected ${manifest.canary?.commit}`);
}

const spellCatalog = readJson("content/spells/canary-spells.json");
const creatureReport = readJson("content/spawns/world-import-report.json");
const itemSemantics = readJson("content/canary-item-semantics.json");
const foodDefinitions = readJson("content/items/canary-foods.json");
const monsterTypes = readJson("content/monsters/world-monsters.json");
const npcTypes = readJson("content/npcs/world-npcs.json");
const npcImportReport = readJson("content/npcs/canary-npc-import-report.json");
const spawnDefinitions = readJson("content/spawns/world-spawns.json");
const spellByPath = new Map(
  spellCatalog.spells.map((spell) => [spell.sourcePath, spell]),
);
const creatureGapByPath = new Map(
  creatureReport.unsupportedDefinitions.map((definition) => [
    definition.sourcePath,
    definition,
  ]),
);
const npcDialogueByPath = new Map(
  npcImportReport.dialogues.definitions.map((definition) => [
    definition.sourcePath,
    definition,
  ]),
);
const npcShopByPath = new Map(
  npcImportReport.shops.definitions.map((definition) => [
    definition.sourcePath,
    definition,
  ]),
);
const unselectedNpcPaths = new Set(
  npcImportReport.unselectedSources.map((source) => source.sourcePath),
);
const treeEntries = parseTree(
  execFileSync(
    "git",
    ["-C", canaryRoot, "ls-tree", "-r", "-z", commit],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  ),
);
const sourceFiles = treeEntries.map((entry) => ({
  path: entry.path,
  blob: entry.blob,
  ...classifySource(
    entry.path,
    spellByPath,
    creatureGapByPath,
    npcDialogueByPath,
    npcShopByPath,
    unselectedNpcPaths,
  ),
}));
const callbacks = sourceFiles.flatMap((source) =>
  source.path.endsWith(".lua") && shouldInspectCallbacks(source.path)
    ? callbacksFor(source, spellByPath)
    : [],
);
const sourceTreeSha256 = createHash("sha256")
  .update(
    sourceFiles
      .map((source) => `${source.blob} ${source.path}`)
      .sort()
      .join("\n"),
  )
  .digest("hex");
const inventory = {
  formatVersion: 1,
  source: {
    repository: manifest.canary.repository,
    commit,
    sourceTreeSha256,
  },
  counts: {
    sourceFiles: sourceFiles.length,
    callbacks: callbacks.length,
    itemDefinitions: Object.keys(itemSemantics.items).length,
    foodDefinitions: Object.keys(foodDefinitions.foods).length,
    spells: spellCatalog.spells.length,
    monsterTypes: monsterTypes.types.length,
    npcTypes: npcTypes.types.length,
    monsterPlacements: spawnDefinitions.slots.filter(
      (slot) => slot.kind === "monster",
    ).length,
    npcPlacements: spawnDefinitions.slots.filter(
      (slot) => slot.kind === "npc",
    ).length,
  },
  collections: [
    {
      id: "item-definitions",
      path: "content/canary-item-semantics.json",
      member: "items",
      ownerTodo: "05-items-and-inventory",
      status: "implemented",
      scope:
        "Static item definitions only; registered actions are owned separately by their source files and callbacks.",
    },
    {
      id: "food-definitions",
      path: "content/items/canary-foods.json",
      member: "foods",
      ownerTodo: "05-items-and-inventory",
      status: "implemented",
    },
    {
      id: "spell-definitions",
      path: "content/spells/canary-spells.json",
      member: "spells",
      ownerTodo: "07-combat",
      statusMember: "parity.status",
    },
    {
      id: "monster-definitions",
      path: "content/monsters/world-monsters.json",
      member: "types",
      ownerTodo: "04-creatures-spawns-and-ai",
      status: "implemented-partial",
      gapsPath: "content/spawns/world-import-report.json",
    },
    {
      id: "npc-definitions",
      path: "content/npcs/world-npcs.json",
      member: "types",
      ownerTodo: "04-creatures-spawns-and-ai",
      status: "implemented-partial",
      gapsPath: "content/spawns/world-import-report.json",
    },
    {
      id: "world-placements",
      path: "content/spawns/world-spawns.json",
      member: "slots",
      ownerTodo: "04-creatures-spawns-and-ai",
      statusMember: "enabled",
      gapsPath: "content/spawns/world-import-report.json",
    },
  ],
  sourceFiles,
  callbacks,
};

const target = join(repoRoot, "content/canary-parity-inventory.json");
const staging = `${target}.${process.pid}.tmp`;
rmSync(staging, { force: true });
writeFileSync(staging, `${JSON.stringify(inventory, null, 2)}\n`);
if (statSync(staging).size === 0) throw new Error("parity inventory is empty");
renameSync(staging, target);
console.log(
  `inventoried ${sourceFiles.length} source files and ${callbacks.length} callbacks`,
);

function readJson(path) {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
}

function parseTree(value) {
  return value
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\d+\s+blob\s+([a-f0-9]+)\t(.+)$/);
      if (!match) throw new Error(`unsupported Canary tree entry ${line}`);
      return { blob: match[1], path: match[2] };
    });
}

function classifySource(
  path,
  spells,
  creatureGaps,
  npcDialogues,
  npcShops,
  unselectedNpcs,
) {
  if (isNonContent(path)) {
    return {
      ownerTodo: "00a-canary-parity",
      status: "non-content",
      reason: nonContentReason(path),
    };
  }
  const spell = spells.get(path);
  if (spell) return spellSourceStatus(spell);
  if (path === "data/items/items.xml") {
    return {
      ownerTodo: "05-items-and-inventory",
      status: "implemented",
      reason: "Converted into the pinned typed static item catalog.",
    };
  }
  if (path === "data/scripts/actions/items/foods.lua") {
    return {
      ownerTodo: "05-items-and-inventory",
      status: "implemented",
      reason:
        "Converted into the typed food catalog and authoritative consume/regeneration path.",
    };
  }
  if (path === "data/XML/vocations.xml") {
    return {
      ownerTodo: "06-progression",
      status: "implemented",
      reason: "Converted into versioned TypeScript vocation definitions.",
    };
  }
  if (
    path === "data-otservbr-global/world/otservbr-monster.xml" ||
    path === "data-otservbr-global/world/otservbr-npc.xml"
  ) {
    return {
      ownerTodo: "04-creatures-spawns-and-ai",
      status: "implemented",
      reason: "Converted into bounded authoritative spawn slots.",
    };
  }
  if (path.startsWith("data-otservbr-global/monster/")) {
    const gap = creatureGaps.get(path);
    return {
      ownerTodo: "04-creatures-spawns-and-ai",
      status: gap ? "blocked" : "implemented",
      ...(gap ? { blockedBy: "04-creatures-spawns-and-ai" } : {}),
      reason: gap
        ? `Definition retains ${gap.ignoredAssignments.length} fields and ${gap.proceduralCallbacks.length} callbacks with explicit owners in the import report.`
        : "Typed monster definition is present in the generated world catalog.",
    };
  }
  if (path.startsWith("data-otservbr-global/npc/")) {
    const dialogue = npcDialogues.get(path);
    const shop = npcShops.get(path);
    if (dialogue) {
      const remaining =
        dialogue.unsupportedKeywordActions.length +
        (dialogue.unsupportedMessages?.length ?? 0) +
        dialogue.proceduralCallbacks.length +
        (shop?.unsupportedRows.length ?? 0) +
        (shop?.unsupportedCallbacks.length ?? 0);
      return {
        ownerTodo: "10-npcs",
        status: "blocked",
        blockedBy: "10-npcs",
        reason:
          `Generated baseline imports ${dialogue.staticNodes} static nodes` +
          `${shop ? ` and ${shop.importedOffers} shop offers` : ""}; ` +
          `${remaining} procedural or source-invalid gaps remain explicit in the NPC import report.`,
      };
    }
    return {
      ownerTodo: "10-npcs",
      status: "blocked",
      blockedBy: "10-npcs",
      reason: unselectedNpcs.has(path)
        ? "NPC source is not referenced by the pinned world spawn selection."
        : "NPC source is missing from the generated import report.",
    };
  }
  const ownerTodo = ownerFor(path);
  return {
    ownerTodo,
    status: "blocked",
    blockedBy: ownerTodo,
    reason: "Pinned player/operator-visible source is registered for its owning parity workstream.",
  };
}

function spellSourceStatus(spell) {
  if (spell.parity?.status === "non-content") {
    return {
      ownerTodo: "07-combat",
      status: "non-content",
      reason: spell.parity.reason,
    };
  }
  if (spell.supported) {
    return {
      ownerTodo: "07-combat",
      status: "implemented",
      reason: "Imported into the executable TypeScript spell registry.",
    };
  }
  return {
    ownerTodo: "07-combat",
    status: "blocked",
    blockedBy: spell.parity?.blockedBy ?? "07-combat",
    reason:
      spell.parity?.reason ??
      `Disabled with explicit reasons: ${spell.unsupportedReasons.join(", ")}.`,
  };
}

function callbacksFor(source, spells) {
  const absolute = join(canaryRoot, source.path);
  let contents;
  try {
    contents = readFileSync(absolute, "utf8");
  } catch {
    throw new Error(
      `Canary sparse checkout is missing ${relative(canaryRoot, absolute)}`,
    );
  }
  const names = [
    ...contents.matchAll(
      /\b(?:function\s+)?[A-Za-z_][A-Za-z0-9_.:]*\.(on[A-Z][A-Za-z0-9_]*)\s*(?:=|\()/g,
    ),
    ...contents.matchAll(
      /\bsetCallback\(\s*([A-Z][A-Z0-9_]+)\s*,/g,
    ),
  ].map((match) => match[1]);
  return [...new Set(names)].sort().map((name) => {
    const spell = spells.get(source.path);
    if (
      source.path === "data/scripts/actions/items/foods.lua" &&
      name === "onUse"
    ) {
      return {
        sourcePath: source.path,
        name,
        ownerTodo: "05-items-and-inventory",
        status: "implemented",
        reason:
          "Food fullness, durable consumption, messaging, and regeneration are implemented as typed server behavior.",
      };
    }
    const deferred = spell?.supported
      ? supportedCallbackDependency(source.path, name)
      : null;
    if (deferred) {
      return {
        sourcePath: source.path,
        name,
        ownerTodo: "07-combat",
        status: "blocked",
        blockedBy: deferred,
        reason:
          "The core spell is executable; this callback branch belongs to a later optional feature.",
      };
    }
    if (spell?.supported) {
      return {
        sourcePath: source.path,
        name,
        ownerTodo: "07-combat",
        status: "implemented",
        reason:
          name === "onCastSpell"
            ? "Reviewed cast behavior is represented as typed authoritative data."
            : "Reviewed formula callback is represented by the typed expression tree.",
      };
    }
    return {
      sourcePath: source.path,
      name,
      ownerTodo: callbackOwner(source.path, name),
      status: "blocked",
      blockedBy:
        spell?.parity?.blockedBy ?? callbackOwner(source.path, name),
      reason:
        spell?.parity?.reason ??
        "Procedural callback requires a reviewed TypeScript implementation.",
    };
  });
}

function supportedCallbackDependency(path, name) {
  if (
    name === "onCastSpell" &&
    (path.endsWith("/haste.lua") ||
      path.endsWith("/strong_haste.lua") ||
      path.endsWith("/magic_shield.lua") ||
      path.endsWith("/energy_beam.lua") ||
      path.endsWith("/energy_wave.lua") ||
      path.endsWith("/great_energy_beam.lua"))
  ) {
    return "14-optional-features";
  }
  return null;
}

function shouldInspectCallbacks(path) {
  return (
    path.startsWith("data/scripts/") ||
    path.startsWith("data-otservbr-global/")
  );
}

function isNonContent(path) {
  return (
    path.startsWith(".") ||
    path.startsWith("cmake/") ||
    path.startsWith("docker/") ||
    path.startsWith("docs/") ||
    path.startsWith("metrics/") ||
    path.startsWith("tests/") ||
    path.startsWith("tools/") ||
    path.startsWith("vcproj/") ||
    path.startsWith("data-canary/") ||
    [
      "AGENTS.md",
      "CMakeLists.txt",
      "CMakePresets.json",
      "CODE_OF_CONDUCT.md",
      "CONTRIBUTING.md",
      "GitVersion.yml",
      "Jenkinsfile",
      "LICENSE",
      "README.md",
      "apply.patch",
      "canary.rc",
      "gdb_debug",
      "key.pem",
      "package.json",
      "recompile.sh",
      "start.sh",
      "start_gdb.sh",
      "vcpkg-configuration.json",
      "vcpkg.json",
    ].includes(path)
  );
}

function nonContentReason(path) {
  if (path.startsWith("data-canary/")) {
    return "Alternate example datapack; the pinned OTServBR Global datapack is the content baseline.";
  }
  if (path.startsWith("tests/")) {
    return "Upstream test fixture or test code, not registered gameplay content.";
  }
  if (path.startsWith("docs/")) return "Documentation only.";
  return "Build, repository, development, or deployment support with no player/operator-visible gameplay definition.";
}

function ownerFor(path) {
  if (/vocation|skill|stamina|training|regenerat/i.test(path)) {
    return "06-progression";
  }
  if (/combat|spell|rune|condition|weapon/i.test(path)) return "07-combat";
  if (/death|corpse|loot|decay/i.test(path)) return "08-death-loot-and-decay";
  if (/chat|channel|talkaction|speech/i.test(path)) return "09-chat";
  if (/npc/i.test(path)) return "10-npcs";
  if (/market|shop|bank|depot|inbox|trade|mail|stash/i.test(path)) {
    return "11-economy";
  }
  if (/quest|action|movement|raid|globalevent|event/i.test(path)) {
    return "12-quests-and-world-actions";
  }
  if (/party|guild|house|pvp|vip|friend/i.test(path)) {
    return "13-social-and-houses";
  }
  if (/bestiary|bosstiary|charm|prey|wheel|forge|imbu|familiar|mount|outfit/i.test(path)) {
    return "14-optional-features";
  }
  if (/monster|spawn|creature|pathfind/i.test(path)) {
    return "04-creatures-spawns-and-ai";
  }
  if (/item|container|inventory/i.test(path)) return "05-items-and-inventory";
  if (/map|tile|teleport|position|walk/i.test(path)) {
    return "02-map-and-movement";
  }
  if (/protocol|network|server|config|database|schema/i.test(path)) {
    return "16-operations-and-security";
  }
  return "00a-canary-parity";
}

function callbackOwner(path, name) {
  if (/death|loot/i.test(name)) return "08-death-loot-and-decay";
  if (path.includes("/npc/")) return "10-npcs";
  return ownerFor(path);
}
