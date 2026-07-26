import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Extracts the two modern-item appearance flags mantus needs from Canary's
// protobuf appearances.dat (the 8.6-era .dat the client renders from has
// neither): `upgrade_classification` (AppearanceFlags field 48) for item
// tiers/forge, and `proficiency_id` (field 61) for weapon proficiency.
// Hand-rolled proto2 wire walking on the three message levels involved —
// Appearances.object (1) -> Appearance{id:1, flags:3} ->
// AppearanceFlags{upgradeclassification:48, proficiency:61} -> {value:1}.

const repoRoot = resolve(import.meta.dirname, "..");
const canaryPath = process.argv[2] ?? process.env.CANARY_PATH;
if (!canaryPath) {
  throw new Error(
    "usage: node tools/extractCanaryAppearanceFlags.mjs <canary-checkout>",
  );
}

const manifestPath = join(repoRoot, "content/source-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const pinnedCommit = manifest.canary.commit;
const checkoutCommit = execFileSync("git", ["-C", canaryPath, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (checkoutCommit !== pinnedCommit) {
  throw new Error(
    `canary checkout is at ${checkoutCommit}, but the manifest pins ${pinnedCommit}`,
  );
}

const datPath = join(canaryPath, "data/items/appearances.dat");
const buffer = await readFile(datPath);

function readVarint(bytes, offset) {
  let value = 0n;
  let shift = 0n;
  let cursor = offset;
  for (;;) {
    const byte = bytes[cursor];
    if (byte === undefined) throw new Error("varint past end of buffer");
    cursor += 1;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
    if (shift > 63n) throw new Error("varint too long");
  }
  return { value, next: cursor };
}

/** Walks one message, invoking visit(fieldNumber, wireType, value|slice). */
function walkMessage(bytes, start, end, visit) {
  let cursor = start;
  while (cursor < end) {
    const key = readVarint(bytes, cursor);
    cursor = key.next;
    const fieldNumber = Number(key.value >> 3n);
    const wireType = Number(key.value & 7n);
    switch (wireType) {
      case 0: {
        const varint = readVarint(bytes, cursor);
        cursor = varint.next;
        visit(fieldNumber, wireType, varint.value);
        break;
      }
      case 1:
        visit(fieldNumber, wireType, null);
        cursor += 8;
        break;
      case 2: {
        const length = readVarint(bytes, cursor);
        cursor = length.next;
        const size = Number(length.value);
        visit(fieldNumber, wireType, [cursor, cursor + size]);
        cursor += size;
        break;
      }
      case 5:
        visit(fieldNumber, wireType, null);
        cursor += 4;
        break;
      default:
        throw new Error(`unsupported wire type ${wireType}`);
    }
  }
  if (cursor !== end) throw new Error("message overran its length");
}

function firstVarintField(bytes, range, wantedField) {
  let found;
  walkMessage(bytes, range[0], range[1], (field, wire, value) => {
    if (field === wantedField && wire === 0 && found === undefined) {
      found = Number(value);
    }
  });
  return found;
}

const entries = [];
walkMessage(buffer, 0, buffer.length, (field, wire, value) => {
  if (field !== 1 || wire !== 2) return;
  const [objectStart, objectEnd] = value;
  let clientId;
  let flagsRange = null;
  walkMessage(buffer, objectStart, objectEnd, (objectField, objectWire, objectValue) => {
    if (objectField === 1 && objectWire === 0) clientId = Number(objectValue);
    if (objectField === 3 && objectWire === 2) flagsRange = objectValue;
  });
  if (clientId === undefined || !flagsRange) return;
  let classification;
  let proficiencyId;
  walkMessage(buffer, flagsRange[0], flagsRange[1], (flagField, flagWire, flagValue) => {
    if (flagWire !== 2) return;
    if (flagField === 48) {
      classification = firstVarintField(buffer, flagValue, 1);
    } else if (flagField === 61) {
      proficiencyId = firstVarintField(buffer, flagValue, 1);
    }
  });
  if (classification === undefined && proficiencyId === undefined) return;
  entries.push({
    clientId,
    ...(classification !== undefined ? { classification } : {}),
    ...(proficiencyId !== undefined ? { proficiencyId } : {}),
  });
});
entries.sort((a, b) => a.clientId - b.clientId);

const document = {
  formatVersion: 1,
  source: {
    canaryCommit: pinnedCommit,
    path: "data/items/appearances.dat",
    sha256: createHash("sha256").update(buffer).digest("hex"),
  },
  entries,
};

const outputPath = join(repoRoot, "content/items/canary-appearance-flags.json");
await writeFile(outputPath, `${JSON.stringify(document, null, 1)}\n`);
const classified = entries.filter((entry) => entry.classification !== undefined);
const proficient = entries.filter((entry) => entry.proficiencyId !== undefined);
console.log(
  `extracted ${classified.length} classified and ${proficient.length} proficiency-mapped appearances`,
);
