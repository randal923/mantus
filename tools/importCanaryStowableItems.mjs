import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const canaryRoot = resolve(process.argv[2] ?? process.env.CANARY_PATH ?? "");
if (!process.argv[2] && !process.env.CANARY_PATH) {
  throw new Error(
    "usage: node tools/importCanaryStowableItems.mjs <canary-checkout>",
  );
}

const manifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const commit = execFileSync("git", ["-C", canaryRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const source = manifest.sources.canaryAppearances;
if (commit !== source.commit) {
  throw new Error(`Canary checkout is ${commit}, expected ${source.commit}`);
}

const appearances = await readFile(join(canaryRoot, source.path));
const sha256 = createHash("sha256").update(appearances).digest("hex");
if (sha256 !== source.sha256) {
  throw new Error("Canary appearances do not match the pinned manifest");
}

function readVarint(state, end) {
  let value = 0;
  let multiplier = 1;
  for (let byteIndex = 0; byteIndex < 10 && state.offset < end; byteIndex++) {
    const byte = appearances[state.offset++];
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) return value;
    multiplier *= 0x80;
  }
  throw new Error("Canary appearances contain an invalid protobuf varint");
}

function skipField(wireType, state, end) {
  if (wireType === 0) {
    readVarint(state, end);
  } else if (wireType === 1) {
    state.offset += 8;
  } else if (wireType === 2) {
    const length = readVarint(state, end);
    state.offset += length;
  } else if (wireType === 5) {
    state.offset += 4;
  } else {
    throw new Error(`unsupported appearances protobuf wire type ${wireType}`);
  }
  if (state.offset > end) {
    throw new Error("Canary appearances contain a truncated protobuf field");
  }
}

function readMarketWareId(start, end) {
  const state = { offset: start };
  let wareId = 0;
  while (state.offset < end) {
    const tag = readVarint(state, end);
    const field = Math.floor(tag / 8);
    const wireType = tag % 8;
    if (field === 2 && wireType === 0) {
      wareId = readVarint(state, end);
    } else {
      skipField(wireType, state, end);
    }
  }
  return wareId;
}

function readFlagsWareId(start, end) {
  const state = { offset: start };
  let wareId = 0;
  while (state.offset < end) {
    const tag = readVarint(state, end);
    const field = Math.floor(tag / 8);
    const wireType = tag % 8;
    if (field === 36 && wireType === 2) {
      const length = readVarint(state, end);
      const marketEnd = state.offset + length;
      wareId = readMarketWareId(state.offset, marketEnd);
      state.offset = marketEnd;
    } else {
      skipField(wireType, state, end);
    }
  }
  return wareId;
}

function readAppearance(start, end) {
  const state = { offset: start };
  let id = 0;
  let wareId = 0;
  while (state.offset < end) {
    const tag = readVarint(state, end);
    const field = Math.floor(tag / 8);
    const wireType = tag % 8;
    if (field === 1 && wireType === 0) {
      id = readVarint(state, end);
    } else if (field === 3 && wireType === 2) {
      const length = readVarint(state, end);
      const flagsEnd = state.offset + length;
      wareId = readFlagsWareId(state.offset, flagsEnd);
      state.offset = flagsEnd;
    } else {
      skipField(wireType, state, end);
    }
  }
  return { id, wareId };
}

const state = { offset: 0 };
const itemTypeIds = [];
while (state.offset < appearances.length) {
  const tag = readVarint(state, appearances.length);
  const field = Math.floor(tag / 8);
  const wireType = tag % 8;
  if (field === 1 && wireType === 2) {
    const length = readVarint(state, appearances.length);
    const appearanceEnd = state.offset + length;
    const appearance = readAppearance(state.offset, appearanceEnd);
    if (appearance.id > 0 && appearance.id === appearance.wareId) {
      itemTypeIds.push(appearance.id);
    }
    state.offset = appearanceEnd;
  } else {
    skipField(wireType, state, appearances.length);
  }
}

if (itemTypeIds.length !== 4_918 || new Set(itemTypeIds).size !== 4_918) {
  throw new Error(
    `expected 4918 stowable Canary item types, found ${itemTypeIds.length}`,
  );
}

await writeFile(
  join(repoRoot, "server/data/stowable-item-types.json"),
  `${JSON.stringify({
    formatVersion: manifest.converters.stowableItems,
    source: {
      canaryCommit: source.commit,
      path: source.path,
      sha256,
    },
    itemTypeIds,
  })}\n`,
);
console.log(`imported ${itemTypeIds.length} Canary stowable item types`);
