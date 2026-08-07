import { describe, expect, it } from "vitest";
import { from8bitColor } from "./from8bitColor";

describe("from8bitColor", () => {
  it("decodes the 6x6x6 cube in steps of 51", () => {
    expect(from8bitColor(215)).toEqual([255, 255, 255]);
    // The torch color from the DAT (item 100 sanity check in the importer).
    expect(from8bitColor(156)).toEqual([204, 102, 0]);
    expect(from8bitColor(35)).toEqual([0, 255, 255]);
  });

  it("treats zero and out-of-cube indices as no light", () => {
    expect(from8bitColor(0)).toEqual([0, 0, 0]);
    expect(from8bitColor(-1)).toEqual([0, 0, 0]);
    expect(from8bitColor(216)).toEqual([0, 0, 0]);
    expect(from8bitColor(255)).toEqual([0, 0, 0]);
  });
});
