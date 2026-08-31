import { existsSync } from "node:fs";
import { join } from "node:path";
import { storeIconSchema } from "@tibia/protocol";
import { describe, expect, it } from "vitest";

const PRODUCTS_DIR = join(__dirname, "../../public/assets/store/products");

const symbolIcon = storeIconSchema.options.find(
  (option) => option.shape.kind.value === "symbol",
);
if (!symbolIcon || !("symbol" in symbolIcon.shape)) {
  throw new Error("storeIconSchema has no symbol variant");
}
const SYMBOLS = symbolIcon.shape.symbol.options;

/**
 * A symbol icon is drawn from /assets/store/products/<symbol>.png, imported
 * by tools/importOtclientStoreAssets.mjs. A symbol the protocol allows but no
 * file backs would render as a broken image on the shelf, so the enum and the
 * asset directory are held together here.
 */
describe("store product art", () => {
  it.each(SYMBOLS)("ships art for the %s symbol", (symbol) => {
    expect(existsSync(join(PRODUCTS_DIR, `${symbol}.png`))).toBe(true);
  });
});
