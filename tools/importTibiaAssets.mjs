// Imports an extended Tibia 8.6-format DAT/SPR pair into the web asset format.
// Usage: node tools/importTibiaAssets.mjs [Tibia.dat] [Tibia.spr]
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import sharp from "sharp";

const TILE = 32;
const PAD = 1;
const CELL = TILE + PAD * 2;
const SHEET_PX = 4096;
const COLS = Math.floor(SHEET_PX / CELL);
const ROWS = COLS;
const TILES_PER_SHEET = COLS * ROWS;
const MAX_SPRITES_PER_OBJECT = 4096;

const ATTR = {
  ground: 0,
  groundBorder: 1,
  onBottom: 2,
  onTop: 3,
  container: 4,
  stackable: 5,
  forceUse: 6,
  multiUse: 7,
  writable: 8,
  writableOnce: 9,
  fluidContainer: 10,
  splash: 11,
  notWalkable: 12,
  notMoveable: 13,
  blockProjectile: 14,
  notPathable: 15,
  pickupable: 16,
  hangable: 17,
  hookSouth: 18,
  hookEast: 19,
  rotateable: 20,
  light: 21,
  dontHide: 22,
  translucent: 23,
  displacement: 24,
  elevation: 25,
  lyingCorpse: 26,
  animateAlways: 27,
  minimapColor: 28,
  lensHelp: 29,
  fullGround: 30,
  ignoreLook: 31,
  cloth: 32,
  market: 33,
  usable: 34,
  wrapable: 35,
  unwrapable: 36,
  topEffect: 37,
  upgradeClassification: 38,
  wearOut: 39,
  clockExpire: 40,
  expire: 41,
  expireStop: 42,
  podium: 43,
  decoKit: 44,
  defaultAction: 251,
  floorChange: 252,
  noMoveAnimation: 253,
  chargeable: 254,
  end: 255,
};

class BinaryReader {
  offset = 0;

  constructor(buffer) {
    this.buffer = buffer;
  }

  u8() {
    this.require(1);
    return this.buffer[this.offset++];
  }

  i8() {
    const value = this.u8();
    return value > 127 ? value - 256 : value;
  }

  u16() {
    this.require(2);
    const value = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  u32() {
    this.require(4);
    const value = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  i32() {
    this.require(4);
    const value = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  string() {
    const length = this.u16();
    this.require(length);
    const value = this.buffer.toString("utf8", this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  require(bytes) {
    if (this.offset + bytes > this.buffer.length) {
      throw new Error(`unexpected end of DAT at byte ${this.offset}`);
    }
  }
}

function createFlags() {
  return {
    ground: false,
    groundSpeed: 0,
    groundBorder: false,
    fullGround: false,
    container: false,
    pickupable: false,
    notWalkable: false,
    blockProjectile: false,
    notMoveable: false,
    notPathable: false,
    onBottom: false,
    onTop: false,
    stackable: false,
    fluidContainer: false,
    splash: false,
    hangable: false,
    hookSouth: false,
    hookEast: false,
    dontHide: false,
    displacementX: 0,
    displacementY: 0,
    elevation: 0,
    lyingCorpse: false,
    animateAlways: false,
    topEffect: false,
    lightIntensity: 0,
    lightColor: 0,
    floorChange: false,
  };
}

function readFlags(reader) {
  const flags = createFlags();
  while (true) {
    const attribute = reader.u8();
    if (attribute === ATTR.end) return flags;

    switch (attribute) {
      case ATTR.ground:
        flags.ground = true;
        flags.groundSpeed = reader.u16();
        break;
      case ATTR.groundBorder:
        flags.groundBorder = true;
        break;
      case ATTR.onBottom:
        flags.onBottom = true;
        break;
      case ATTR.onTop:
        flags.onTop = true;
        break;
      case ATTR.container:
        flags.container = true;
        break;
      case ATTR.stackable:
        flags.stackable = true;
        break;
      case ATTR.fluidContainer:
        flags.fluidContainer = true;
        break;
      case ATTR.splash:
        flags.splash = true;
        break;
      case ATTR.notWalkable:
        flags.notWalkable = true;
        break;
      case ATTR.notMoveable:
        flags.notMoveable = true;
        break;
      case ATTR.blockProjectile:
        flags.blockProjectile = true;
        break;
      case ATTR.notPathable:
        flags.notPathable = true;
        break;
      case ATTR.pickupable:
        flags.pickupable = true;
        break;
      case ATTR.hangable:
        flags.hangable = true;
        break;
      case ATTR.hookSouth:
        flags.hookSouth = true;
        break;
      case ATTR.hookEast:
        flags.hookEast = true;
        break;
      case ATTR.dontHide:
        flags.dontHide = true;
        break;
      case ATTR.displacement:
        flags.displacementX = reader.u16();
        flags.displacementY = reader.u16();
        break;
      case ATTR.elevation:
        flags.elevation = reader.u16();
        break;
      case ATTR.lyingCorpse:
        flags.lyingCorpse = true;
        break;
      case ATTR.animateAlways:
        flags.animateAlways = true;
        break;
      case ATTR.topEffect:
        flags.topEffect = true;
        break;
      case ATTR.fullGround:
        flags.fullGround = true;
        break;
      case ATTR.floorChange:
        flags.floorChange = true;
        break;
      case ATTR.writable:
      case ATTR.writableOnce:
      case ATTR.minimapColor:
      case ATTR.lensHelp:
      case ATTR.cloth:
      case ATTR.defaultAction:
        reader.u16();
        break;
      case ATTR.light:
        flags.lightIntensity = reader.u16();
        flags.lightColor = reader.u16();
        break;
      case ATTR.market:
        reader.u16();
        reader.u16();
        reader.u16();
        reader.string();
        reader.u16();
        reader.u16();
        break;
      case ATTR.forceUse:
      case ATTR.multiUse:
      case ATTR.rotateable:
      case ATTR.translucent:
      case ATTR.ignoreLook:
      case ATTR.usable:
      case ATTR.wrapable:
      case ATTR.unwrapable:
      case ATTR.upgradeClassification:
      case ATTR.wearOut:
      case ATTR.clockExpire:
      case ATTR.expire:
      case ATTR.expireStop:
      case ATTR.podium:
      case ATTR.decoKit:
      case ATTR.noMoveAnimation:
      case ATTR.chargeable:
        break;
      default:
        throw new Error(`unsupported DAT attribute ${attribute} at byte ${reader.offset - 1}`);
    }
  }
}

function readAnimation(reader, phases, enhancedAnimations) {
  if (phases <= 1) return null;
  if (!enhancedAnimations) return null;

  const timingMode = reader.u8() === 0 ? "asynchronous" : "synchronized";
  const loopCount = reader.i32();
  const rawStartPhase = reader.i8();
  if (rawStartPhase < -1 || rawStartPhase >= phases) {
    throw new Error(`animation start phase ${rawStartPhase} is invalid for ${phases} phases`);
  }
  const phaseMetadata = Array.from({ length: phases }, () => {
    const minimumDurationMs = reader.u32();
    const maximumDurationMs = reader.u32();
    if (maximumDurationMs < minimumDurationMs) {
      throw new Error("animation maximum duration is below its minimum");
    }
    return { minimumDurationMs, maximumDurationMs };
  });
  return {
    source: "enhanced",
    timingMode,
    loopType:
      loopCount < 0 ? "ping-pong" : loopCount === 0 ? "infinite" : "counted",
    loopCount,
    startPhase: rawStartPhase === -1 ? null : rawStartPhase,
    phases: phaseMetadata,
  };
}

function readObject(reader, category, clientId, enhancedAnimations) {
  const flags = readFlags(reader);
  const width = reader.u8();
  const height = reader.u8();
  if (width === 0 || height === 0) {
    throw new Error(`${category} ${clientId} has an invalid ${width}x${height} size`);
  }
  if (width > 1 || height > 1) reader.u8();
  const layers = reader.u8();
  const px = reader.u8();
  const py = reader.u8();
  const pz = reader.u8();
  const phases = reader.u8();
  const animation = readAnimation(reader, phases, enhancedAnimations);
  const spriteCount = width * height * layers * px * py * pz * phases;
  if (spriteCount <= 0 || spriteCount > MAX_SPRITES_PER_OBJECT) {
    throw new Error(`${category} ${clientId} declares ${spriteCount} sprites`);
  }
  const sprites = Array.from({ length: spriteCount }, () => reader.u32());
  const object = {
    category,
    clientId,
    width,
    height,
    layers,
    px,
    py,
    pz,
    phases,
    flags,
    sprites,
  };
  return animation ? { ...object, animation } : object;
}

function parseDat(buffer, enhancedAnimations) {
  const reader = new BinaryReader(buffer);
  const datSignature = reader.u32();
  const counts = {
    item: reader.u16(),
    outfit: reader.u16(),
    effect: reader.u16(),
    missile: reader.u16(),
  };
  const objects = [];
  for (let id = 100; id <= counts.item; id++) {
    objects.push(readObject(reader, "item", id, enhancedAnimations));
  }
  for (const category of ["outfit", "effect", "missile"]) {
    for (let id = 1; id <= counts[category]; id++) {
      objects.push(readObject(reader, category, id, enhancedAnimations));
    }
  }
  if (reader.offset !== buffer.length) {
    throw new Error(`DAT has ${buffer.length - reader.offset} unread bytes`);
  }
  return { datSignature, counts, objects };
}

function validateObjects(objects, spriteCount) {
  let maxSpriteId = 0;
  for (const object of objects) {
    for (const spriteId of object.sprites) {
      maxSpriteId = Math.max(maxSpriteId, spriteId);
      if (spriteId > spriteCount) {
        throw new Error(
          `${object.category} ${object.clientId} references sprite ${spriteId}, but SPR ends at ${spriteCount}`,
        );
      }
    }
  }
  const items = new Map(
    objects.filter((object) => object.category === "item").map((object) => [object.clientId, object]),
  );
  for (const id of [106, 290, 429, 776, 1281, 2109, 50340]) {
    if (!items.has(id)) throw new Error(`required map item ${id} is missing from DAT`);
  }
  if (
    !items.get(106).flags.ground ||
    !items.get(290).flags.groundBorder ||
    !items.get(776).flags.onTop ||
    !items.get(1281).flags.onBottom
  ) {
    throw new Error("landmark flags do not match the expected Tibia client-id layout");
  }
  if (
    items.get(622)?.phases !== 8 ||
    items.get(629)?.phases !== 14 ||
    items.get(4597)?.phases !== 14
  ) {
    throw new Error("animated-water phase counts do not match the expected DAT");
  }
  if (
    items.get(100)?.flags.lightIntensity !== 3 ||
    items.get(100)?.flags.lightColor !== 156
  ) {
    throw new Error("light metadata does not match the expected DAT");
  }
  return maxSpriteId;
}

function decodeSprite(spr, pointer, target, baseX, baseY) {
  if (pointer === 0) return;
  if (pointer + 5 > spr.length) throw new Error(`invalid SPR pointer ${pointer}`);
  let source = pointer + 3;
  const dataLength = spr.readUInt16LE(source);
  source += 2;
  const end = source + dataLength;
  if (end > spr.length) throw new Error(`sprite data at ${pointer} exceeds the SPR file`);

  let pixel = 0;
  while (source < end) {
    if (source + 4 > end) throw new Error(`truncated sprite run at ${pointer}`);
    pixel += spr.readUInt16LE(source);
    const colored = spr.readUInt16LE(source + 2);
    source += 4;
    if (pixel + colored > TILE * TILE || source + colored * 3 > end) {
      throw new Error(`invalid sprite run at ${pointer}`);
    }
    for (let index = 0; index < colored; index++, pixel++) {
      const x = baseX + (pixel % TILE);
      const y = baseY + Math.floor(pixel / TILE);
      const destination = (y * SHEET_PX + x) * 4;
      target[destination] = spr[source++];
      target[destination + 1] = spr[source++];
      target[destination + 2] = spr[source++];
      target[destination + 3] = 255;
    }
  }
}

async function writeAtlases(spr, spriteCount, stagingDir) {
  const pointerTableEnd = 8 + spriteCount * 4;
  if (pointerTableEnd > spr.length) throw new Error("SPR pointer table exceeds the file size");
  const sheetCount = Math.ceil(spriteCount / TILES_PER_SHEET);
  const sheets = [];
  sharp.cache(false);

  for (let sheet = 0; sheet < sheetCount; sheet++) {
    const pixels = Buffer.alloc(SHEET_PX * SHEET_PX * 4);
    const firstSpriteId = sheet * TILES_PER_SHEET + 1;
    const lastSpriteId = Math.min(spriteCount, firstSpriteId + TILES_PER_SHEET - 1);
    for (let spriteId = firstSpriteId; spriteId <= lastSpriteId; spriteId++) {
      const cell = spriteId - firstSpriteId;
      const baseX = (cell % COLS) * CELL + PAD;
      const baseY = Math.floor(cell / COLS) * CELL + PAD;
      const pointer = spr.readUInt32LE(8 + (spriteId - 1) * 4);
      decodeSprite(spr, pointer, pixels, baseX, baseY);
    }
    const name = `atlas-${sheet}.png`;
    await sharp(pixels, {
      raw: { width: SHEET_PX, height: SHEET_PX, channels: 4 },
    })
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toFile(join(stagingDir, name));
    sheets.push(name);
    console.log(`atlas ${sheet + 1}/${sheetCount}: sprites ${firstSpriteId}..${lastSpriteId}`);
  }
  return sheets;
}

async function publish(stagingDir, outputDir, names) {
  const backupDir = join(outputDir, `.import-backup-${Date.now()}`);
  await mkdir(backupDir, { recursive: true });
  const replacements = new Set(names);
  const existing = (await readdir(outputDir)).filter((name) =>
    replacements.has(name),
  );
  try {
    for (const name of existing) await rename(join(outputDir, name), join(backupDir, name));
    for (const name of names) await rename(join(stagingDir, name), join(outputDir, name));
    await rm(backupDir, { recursive: true, force: true });
    await rm(stagingDir, { recursive: true, force: true });
  } catch (error) {
    for (const name of names) {
      await rm(join(outputDir, name), { force: true });
    }
    for (const name of await readdir(backupDir)) {
      await rename(join(backupDir, name), join(outputDir, name));
    }
    await rm(backupDir, { recursive: true, force: true });
    throw error;
  }
}

const repoRoot = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const validateOnly = args.includes("--validate-only");
const metadataOnly = args.includes("--metadata-only");
const enhancedAnimations = args.includes("--enhanced-animations");
if (validateOnly && metadataOnly) {
  throw new Error("--validate-only and --metadata-only cannot be combined");
}
const paths = args.filter((argument) => !argument.startsWith("--"));
const datPath = resolve(paths[0] ?? join(repoRoot, "map/Tibia.dat"));
const sprPath = resolve(paths[1] ?? join(repoRoot, "map/Tibia.spr"));
const outputDir = join(repoRoot, "client/public/assets");
const stagingDir = join(outputDir, ".import-staging");

console.log(`DAT: ${datPath}`);
console.log(`SPR: ${sprPath}`);
if (!validateOnly) {
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });
}

const dat = await readFile(datPath);
const parsed = parseDat(dat, enhancedAnimations);
console.log(
  `objects: items through ${parsed.counts.item}, ${parsed.counts.outfit} outfits, ${parsed.counts.effect} effects, ${parsed.counts.missile} missiles`,
);

const spr = await readFile(sprPath);
const sprSignature = spr.readUInt32LE(0);
const spriteCount = spr.readUInt32LE(4);
const maxReferencedSprite = validateObjects(parsed.objects, spriteCount);
console.log(`sprites: ${spriteCount} (${maxReferencedSprite} highest referenced)`);

if (validateOnly) {
  console.log("validation passed; existing web assets were not changed");
  process.exit(0);
}

const objectsFile = {
  formatVersion: 2,
  source: {
    datSha256: createHash("sha256").update(dat).digest("hex"),
    sprSha256: createHash("sha256").update(spr).digest("hex"),
  },
  datSignature: parsed.datSignature,
  sprSignature,
  counts: parsed.counts,
  profile: {
    attrShift: false,
    enhancedAnim: enhancedAnimations,
    frameGroups: false,
    spritesU32: true,
  },
  objects: parsed.objects,
};
await writeFile(join(stagingDir, "objects.json"), JSON.stringify(objectsFile));
if (metadataOnly) {
  await publish(stagingDir, outputDir, ["objects.json"]);
  console.log(`imported ${basename(datPath)} metadata into ${outputDir}`);
  process.exit(0);
}

const sheets = await writeAtlases(spr, spriteCount, stagingDir);
const atlasIndex = {
  tile: TILE,
  pad: PAD,
  cell: CELL,
  sheetPx: SHEET_PX,
  cols: COLS,
  rows: ROWS,
  tilesPerSheet: TILES_PER_SHEET,
  sheetCount: sheets.length,
  spriteCount,
  sheets,
};
await writeFile(join(stagingDir, "atlas-index.json"), JSON.stringify(atlasIndex));
await publish(stagingDir, outputDir, [...sheets, "objects.json", "atlas-index.json"]);

console.log(`imported ${basename(datPath)} and ${basename(sprPath)} into ${outputDir}`);
