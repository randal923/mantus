#!/usr/bin/env node
// Derives, per NPC, the categories of items the NPC sells to players
// (entries with a buyPrice in content/npcs/canary-shops.json, classified via
// server/data/item-catalog.json) and writes them to
// client/public/assets/npc-shop-categories.json keyed by lower-cased NPC
// name. The minimap tooltip uses this static, public shop metadata.
//
//   yarn npcs:shop-categories
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NPCS_DIR = join(ROOT, "content/npcs");
const OUT_PATH = join(ROOT, "client/public/assets/npc-shop-categories.json");

function loadCatalogById() {
  const catalog = JSON.parse(
    readFileSync(join(ROOT, "server/data/item-catalog.json"), "utf8"),
  );
  const byId = new Map();
  for (const item of Object.values(catalog.items)) byId.set(item.id, item);
  return byId;
}

function loadNpcNamesByTypeId() {
  const names = new Map();
  for (const file of ["world-npcs.json", "starter-npcs.json"]) {
    const path = join(NPCS_DIR, file);
    if (!existsSync(path)) continue;
    const document = JSON.parse(readFileSync(path, "utf8"));
    for (const type of document.types) names.set(type.id, type.name);
  }
  return names;
}

const EQUIPMENT_CATEGORY = {
  helmet: "helmets",
  armor: "armors",
  legs: "legs",
  boots: "boots",
  shield: "shields",
  ring: "rings",
  amulet: "amulets",
  backpack: "containers",
  ammo: "ammunition",
};

const WEAPON_CATEGORY = {
  sword: "weapons",
  axe: "weapons",
  club: "weapons",
  fist: "weapons",
  distance: "distance",
  ammunition: "ammunition",
  wand: "wands",
  spellbook: "wands",
};

function categorizeItem(item) {
  if (!item) return "supplies";
  if (item.kind === "rune") return "runes";
  if (item.name?.includes("potion")) return "potions";
  if (item.food || item.kind === "food") return "food";
  const bySlot =
    item.equipmentSlot === "weapon"
      ? WEAPON_CATEGORY[item.weaponType]
      : EQUIPMENT_CATEGORY[item.equipmentSlot];
  if (bySlot) return bySlot;
  if (item.weaponType) return WEAPON_CATEGORY[item.weaponType] ?? "weapons";
  return "supplies";
}

const catalogById = loadCatalogById();
const namesByTypeId = loadNpcNamesByTypeId();
const shopsDocument = JSON.parse(
  readFileSync(join(NPCS_DIR, "canary-shops.json"), "utf8"),
);

const npcs = {};
let missingNames = 0;
for (const shop of shopsDocument.shops) {
  const name = namesByTypeId.get(shop.npcTypeId);
  if (!name) {
    missingNames++;
    continue;
  }
  const counts = new Map();
  for (const entry of shop.entries) {
    if (!entry.buyPrice || entry.buyPrice <= 0) continue;
    const category = categorizeItem(catalogById.get(entry.itemTypeId));
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  if (counts.size === 0) continue;
  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category]) => category);
  const key = name.toLowerCase();
  npcs[key] = [...new Set([...(npcs[key] ?? []), ...sorted])];
}

writeFileSync(
  OUT_PATH,
  `${JSON.stringify({ formatVersion: 1, npcs }, null, 1)}\n`,
);
console.log(
  `wrote ${Object.keys(npcs).length} NPC shop category lists` +
    (missingNames ? ` (${missingNames} shops without a known NPC type)` : ""),
);
