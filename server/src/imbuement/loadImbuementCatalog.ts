import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ImbuementBase,
  ImbuementCatalog,
  ImbuementCategory,
  ImbuementDefinition,
} from "./ImbuementCatalog";

const CONTENT_DIR =
  process.env.CONTENT_DIR ??
  fileURLToPath(new URL("../../../content", import.meta.url));

/**
 * Loads the pinned imbuement catalog (content/imbuements.json, transcribed
 * from Canary data/XML/imbuements.xml by tools/importCanaryImbuements.mjs).
 * Fails closed on any shape surprise — a malformed catalog must never load.
 */
export function loadImbuementCatalog(): ImbuementCatalog {
  const parsed: unknown = JSON.parse(
    readFileSync(join(CONTENT_DIR, "imbuements.json"), "utf8"),
  );
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { formatVersion?: unknown }).formatVersion !== 1
  ) {
    throw new Error("imbuement catalog has an unsupported format version");
  }
  const document = parsed as {
    bases: unknown[];
    categories: unknown[];
    imbuements: unknown[];
  };
  if (
    !Array.isArray(document.bases) ||
    !Array.isArray(document.categories) ||
    !Array.isArray(document.imbuements)
  ) {
    throw new Error("imbuement catalog is missing sections");
  }
  const bases = new Map<number, ImbuementBase>();
  for (const base of document.bases as ImbuementBase[]) {
    if (!Number.isInteger(base.id) || base.priceGold < 0) {
      throw new Error("imbuement catalog base is invalid");
    }
    bases.set(base.id, base);
  }
  const categories = new Map<string, ImbuementCategory>();
  for (const category of document.categories as ImbuementCategory[]) {
    if (typeof category.slug !== "string" || category.slug.length === 0) {
      throw new Error("imbuement catalog category is invalid");
    }
    categories.set(category.slug, category);
  }
  const imbuements = new Map<number, ImbuementDefinition>();
  for (const imbuement of document.imbuements as ImbuementDefinition[]) {
    if (
      !Number.isInteger(imbuement.id) ||
      !bases.has(imbuement.baseId) ||
      !categories.has(imbuement.categorySlug) ||
      !imbuement.effect ||
      !Array.isArray(imbuement.astralSources)
    ) {
      throw new Error(`imbuement catalog entry ${imbuement.id} is invalid`);
    }
    imbuements.set(imbuement.id, imbuement);
  }
  if (imbuements.size === 0) throw new Error("imbuement catalog is empty");
  return { bases, categories, imbuements };
}
