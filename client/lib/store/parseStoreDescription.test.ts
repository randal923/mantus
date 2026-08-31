import { describe, expect, it } from "vitest";
import { parseStoreDescription } from "./parseStoreDescription";

const captionOf = (key: string, params?: Readonly<Record<string, number>>) =>
  params ? `${key}:${JSON.stringify(params)}` : `caption(${key})`;

describe("parseStoreDescription", () => {
  it("turns a bare tag into its localised caption", () => {
    expect(parseStoreDescription("{character}", captionOf)).toEqual([
      { icon: "character", text: "caption(character)" },
    ]);
  });

  it("keeps a tag's own text when it carries some", () => {
    expect(
      parseStoreDescription("{info} lasts for 1 hour hunting time", captionOf),
    ).toEqual([{ icon: "info", text: "lasts for 1 hour hunting time" }]);
  });

  it("renders an icon-only tag with no caption as nothing", () => {
    expect(parseStoreDescription("{charactericon}", captionOf)).toEqual([]);
  });

  it("expands Canary's parameterised limit tag", () => {
    expect(parseStoreDescription("{limit|50}", captionOf)).toEqual([
      { icon: "once", text: 'limit:{"count":50}' },
    ]);
  });

  it("keeps plain lines and drops blank ones", () => {
    expect(
      parseStoreDescription("Restores hit points.\n\n{storeinbox}", captionOf),
    ).toEqual([
      { icon: null, text: "Restores hit points." },
      { icon: "storeinbox", text: "caption(storeinbox)" },
    ]);
  });

  it("drops a tag it has no icon for but keeps its text", () => {
    expect(parseStoreDescription("{hireling} works for you", captionOf)).toEqual(
      [{ icon: null, text: "works for you" }],
    );
  });
});
