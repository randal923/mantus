// Emits client/public/assets/appearance-animations.json: the per-phase
// animation timings real Tibia plays, read out of Canary's protobuf
// appearances.dat.
//
// The extended 15.11 Tibia.dat the client renders from is the legacy format —
// it stores a phase count per object and nothing else — so without this table
// every animated item and effect runs at one invented fallback rate. Real
// Tibia is not uniform: phase durations range from 30ms to a minute, and a
// thousand objects vary their duration per phase (a long idle frame, then a
// fast glint).
//
// Only objects whose protobuf phase count matches the DAT's are emitted, so a
// re-ripped asset pack can never animate an item on another item's schedule.
//
// Usage: node tools/importAppearanceAnimations.mjs <canary-checkout|appearances.dat>
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const sourcePath = process.argv[2] ?? process.env.CANARY_PATH;
if (!sourcePath) {
  throw new Error(
    "usage: node tools/importAppearanceAnimations.mjs <canary-checkout|appearances.dat>",
  );
}

const manifest = JSON.parse(
  await readFile(join(repoRoot, "content/source-manifest.json"), "utf8"),
);
const appearancesPath = (await stat(sourcePath)).isDirectory()
  ? join(sourcePath, manifest.sources.canaryAppearances.path)
  : sourcePath;
const buffer = await readFile(appearancesPath);
const sha256 = createHash("sha256").update(buffer).digest("hex");
if (sha256 !== manifest.sources.canaryAppearances.sha256) {
  throw new Error(
    `${appearancesPath} hashes ${sha256}, but the manifest pins ${manifest.sources.canaryAppearances.sha256}`,
  );
}

const objects = JSON.parse(
  await readFile(join(repoRoot, "client/public/assets/objects.json"), "utf8"),
);
if (
  objects.formatVersion !== manifest.converters.assets ||
  objects.source?.datSha256 !== manifest.sources.dat.sha256
) {
  throw new Error("DAT appearances do not match the pinned source manifest");
}

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
        cursor += 4;
        break;
      default:
        throw new Error(`unsupported wire type ${wireType}`);
    }
  }
  if (cursor !== end) throw new Error("message overran its length");
}

// Appearances{object:1, effect:3} -> Appearance{id:1, frameGroup:2} ->
// FrameGroup{spriteInfo:3} -> SpriteInfo{animation:6} ->
// SpriteAnimation{defaultStartPhase:1, synchronized:2, randomStartPhase:3,
// loopType:4, loopCount:5, spritePhase:6} -> SpritePhase{min:1, max:2}.
const CATEGORY_FIELDS = { item: 1, effect: 3 };
const LOOP_TYPES = { "-1": "ping-pong", 0: "infinite", 1: "counted" };

function readAnimation(range) {
  const phases = [];
  let startPhase = 0;
  let synchronized = false;
  let randomStartPhase = false;
  let loopType = "infinite";
  let loopCount = 0;
  walkMessage(buffer, range[0], range[1], (field, wire, value) => {
    if (field === 1 && wire === 0) startPhase = Number(value);
    if (field === 2 && wire === 0) synchronized = value !== 0n;
    if (field === 3 && wire === 0) randomStartPhase = value !== 0n;
    if (field === 4 && wire === 0) {
      const raw = BigInt.asIntN(64, value).toString();
      loopType = LOOP_TYPES[raw];
      if (!loopType) throw new Error(`unsupported loop type ${raw}`);
    }
    if (field === 5 && wire === 0) loopCount = Number(value);
    if (field !== 6 || wire !== 2) return;
    let minimum = 0;
    let maximum = 0;
    walkMessage(buffer, value[0], value[1], (phaseField, phaseWire, phaseValue) => {
      if (phaseField === 1 && phaseWire === 0) minimum = Number(phaseValue);
      if (phaseField === 2 && phaseWire === 0) maximum = Number(phaseValue);
    });
    if (maximum < minimum) {
      throw new Error("animation maximum duration is below its minimum");
    }
    phases.push([minimum, maximum]);
  });
  if (phases.length === 0) return null;
  return {
    phases,
    startPhase: randomStartPhase ? null : startPhase,
    synchronized,
    loopType,
    loopCount,
  };
}

function readCategory(categoryField) {
  const animations = new Map();
  walkMessage(buffer, 0, buffer.length, (field, wire, value) => {
    if (field !== categoryField || wire !== 2) return;
    let clientId;
    let firstFrameGroup = null;
    walkMessage(buffer, value[0], value[1], (objectField, objectWire, objectValue) => {
      if (objectField === 1 && objectWire === 0) clientId = Number(objectValue);
      if (objectField === 2 && objectWire === 2 && !firstFrameGroup) {
        firstFrameGroup = objectValue;
      }
    });
    if (clientId === undefined || !firstFrameGroup) return;
    let spriteInfo = null;
    walkMessage(buffer, firstFrameGroup[0], firstFrameGroup[1], (groupField, groupWire, groupValue) => {
      if (groupField === 3 && groupWire === 2) spriteInfo = groupValue;
    });
    if (!spriteInfo) return;
    let animationRange = null;
    walkMessage(buffer, spriteInfo[0], spriteInfo[1], (spriteField, spriteWire, spriteValue) => {
      if (spriteField === 6 && spriteWire === 2) animationRange = spriteValue;
    });
    if (!animationRange) return;
    const animation = readAnimation(animationRange);
    if (animation) animations.set(clientId, animation);
  });
  return animations;
}

const phaseCounts = new Map();
for (const object of objects.objects) {
  phaseCounts.set(`${object.category}:${object.clientId}`, object.phases);
}

/** Uniform schedules — most of them — store one number instead of an array. */
function encode(animation) {
  const minima = animation.phases.map(([minimum]) => minimum);
  const maxima = animation.phases.map(([, maximum]) => maximum);
  const uniform = minima.every((duration) => duration === minima[0]);
  const entry = { d: uniform ? minima[0] : minima };
  if (maxima.some((maximum, index) => maximum !== minima[index])) {
    entry.x = maxima.every((duration) => duration === maxima[0]) ? maxima[0] : maxima;
  }
  if (animation.synchronized) entry.s = 1;
  if (animation.startPhase === null) entry.p = null;
  else if (animation.startPhase > 0) entry.p = animation.startPhase;
  if (animation.loopType !== "infinite") entry.l = animation.loopType;
  if (animation.loopType === "counted") entry.c = animation.loopCount;
  return entry;
}

const emitted = {};
const skipped = {};
for (const [category, categoryField] of Object.entries(CATEGORY_FIELDS)) {
  const parsed = readCategory(categoryField);
  const entries = {};
  let mismatched = 0;
  for (const [clientId, animation] of [...parsed].sort((left, right) => left[0] - right[0])) {
    if (phaseCounts.get(`${category}:${clientId}`) !== animation.phases.length) {
      mismatched += 1;
      continue;
    }
    entries[clientId] = encode(animation);
  }
  emitted[category] = entries;
  skipped[category] = mismatched;
}

const document = {
  formatVersion: 1,
  source: {
    canaryCommit: manifest.canary.commit,
    path: manifest.sources.canaryAppearances.path,
    sha256,
  },
  animations: emitted,
};
const outputPath = join(repoRoot, "client/public/assets/appearance-animations.json");
await writeFile(outputPath, `${JSON.stringify(document)}\n`);
for (const category of Object.keys(CATEGORY_FIELDS)) {
  console.log(
    `${category}: ${Object.keys(emitted[category]).length} animations` +
      ` (${skipped[category]} skipped for a phase count the DAT disagrees with)`,
  );
}
