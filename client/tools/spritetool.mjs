#!/usr/bin/env node
// Offline sprite inspector for the Tibia assets in public/assets.
// See ASSETS.md for the data format. Requires sharp (already a dependency).
//
//   node tools/spritetool.mjs render <item|outfit|effect> <id> [out.png] [--x N --y N --z N --phase N --layer N]
//   node tools/spritetool.mjs sheet  <item|outfit|effect> <fromId> <toId> [out.png] [--cols N --cell N]
//   node tools/spritetool.mjs tiled  <groundItemId> [out.png]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "../public/assets");
const idx = JSON.parse(readFileSync(join(ASSETS, "atlas-index.json"), "utf8"));
const data = JSON.parse(readFileSync(join(ASSETS, "objects.json"), "utf8"));

const byCat = { item: new Map(), outfit: new Map(), effect: new Map(), missile: new Map() };
for (const o of data.objects) byCat[o.category]?.set(o.clientId, o);

function spriteRect(spriteId) {
  const cell = spriteId - 1;
  const sheet = Math.floor(cell / idx.tilesPerSheet);
  const rem = cell % idx.tilesPerSheet;
  return {
    sheet,
    left: (rem % idx.cols) * idx.cell + idx.pad,
    top: Math.floor(rem / idx.cols) * idx.cell + idx.pad,
  };
}

async function cropSprite(spriteId) {
  const r = spriteRect(spriteId);
  return sharp(join(ASSETS, idx.sheets[r.sheet]))
    .extract({ left: r.left, top: r.top, width: idx.tile, height: idx.tile })
    .png()
    .toBuffer();
}

function spriteId(o, { w = 0, h = 0, l = 0, x = 0, y = 0, z = 0, phase = 0 }) {
  const i =
    (((((phase * o.pz + z) * o.py + (y % o.py)) * o.px + (x % o.px)) * o.layers + l) * o.height + h) *
      o.width +
    w;
  return o.sprites[i] ?? 0;
}

// Render one full frame (all w×h pieces) of an object to a sharp image.
async function renderObject(o, p = {}) {
  const t = idx.tile;
  const comps = [];
  for (let h = 0; h < o.height; h++) {
    for (let w = 0; w < o.width; w++) {
      const sid = spriteId(o, { ...p, w, h });
      if (!sid) continue;
      comps.push({
        input: await cropSprite(sid),
        left: (o.width - 1 - w) * t,
        top: (o.height - 1 - h) * t,
      });
    }
  }
  return sharp({
    create: { width: o.width * t, height: o.height * t, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(comps)
    .png();
}

async function contactSheet(entries, outFile, cols, cellPx) {
  const rows = Math.ceil(entries.length / cols);
  const comps = [];
  for (let i = 0; i < entries.length; i++) {
    try {
      const buf = await (await renderObject(entries[i].o, entries[i].p)).toBuffer();
      const meta = await sharp(buf).metadata();
      const scale = Math.min(cellPx / meta.width, cellPx / meta.height, 2);
      comps.push({
        input: await sharp(buf)
          .resize(Math.round(meta.width * scale), Math.round(meta.height * scale), { kernel: "nearest" })
          .toBuffer(),
        left: (i % cols) * cellPx,
        top: Math.floor(i / cols) * cellPx,
      });
    } catch (err) {
      console.error("skip", entries[i].label, err.message);
    }
  }
  await sharp({
    create: { width: cols * cellPx, height: rows * cellPx, channels: 4, background: { r: 40, g: 40, b: 60, alpha: 255 } },
  })
    .composite(comps)
    .png()
    .toFile(outFile);
  for (let r = 0; r < rows; r++) {
    console.log(`row ${r}: ${entries.slice(r * cols, (r + 1) * cols).map((e) => e.label).join(" | ")}`);
  }
}

function parseFlags(args) {
  const p = {};
  for (let i = 0; i < args.length; i += 2) {
    if (args[i]?.startsWith("--")) p[args[i].slice(2)] = Number(args[i + 1]);
  }
  return p;
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "render") {
  const [cat, id] = rest;
  const out = rest[2]?.endsWith(".png") ? rest[2] : `${cat}-${id}.png`;
  const o = byCat[cat]?.get(Number(id));
  if (!o) throw new Error(`no ${cat} with clientId ${id}`);
  console.log(JSON.stringify({ ...o, sprites: `[${o.sprites.length} ids]` }));
  await (await renderObject(o, parseFlags(rest))).toFile(out);
  console.log("wrote", out);
} else if (cmd === "sheet") {
  const [cat, from, to] = rest;
  const out = rest[3]?.endsWith(".png") ? rest[3] : `sheet-${cat}-${from}-${to}.png`;
  const flags = parseFlags(rest);
  const entries = [];
  for (let id = Number(from); id <= Number(to); id++) {
    const o = byCat[cat]?.get(id);
    if (o) entries.push({ label: String(id), o, p: cat === "outfit" ? { x: 2 } : {} });
  }
  await contactSheet(entries, out, flags.cols || 16, flags.cell || 56);
  console.log("wrote", out, `(${entries.length} objects)`);
} else if (cmd === "tiled") {
  const [id] = rest;
  const out = rest[1]?.endsWith(".png") ? rest[1] : `tiled-${id}.png`;
  const o = byCat.item.get(Number(id));
  if (!o) throw new Error(`no item ${id}`);
  const t = idx.tile;
  const comps = [];
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++)
      comps.push({ input: await (await renderObject(o, { x, y })).toBuffer(), left: x * t, top: y * t });
  await sharp({ create: { width: 4 * t, height: 4 * t, channels: 4, background: { r: 30, g: 30, b: 40, alpha: 255 } } })
    .composite(comps)
    .png()
    .toFile(out);
  console.log("wrote", out);
} else {
  console.log("usage: render <cat> <id> [out] [--x --y --phase --layer] | sheet <cat> <from> <to> [out] | tiled <id> [out]");
}
