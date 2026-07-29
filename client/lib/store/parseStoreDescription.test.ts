import { describe, expect, it } from "vitest";
import { parseStoreDescription } from "./parseStoreDescription";

describe("parseStoreDescription", () => {
  it("turns a bare tag into its official caption", () => {
    expect(parseStoreDescription("{character}")).toEqual([
      { icon: "character", text: "only usable by purchasing character" },
    ]);
  });

  it("keeps a tag's own text when it carries some", () => {
    expect(
      parseStoreDescription("{info} lasts for 1 hour hunting time"),
    ).toEqual([{ icon: "info", text: "lasts for 1 hour hunting time" }]);
  });

  it("renders an icon-only tag with no caption as nothing", () => {
    expect(parseStoreDescription("{charactericon}")).toEqual([]);
  });

  it("expands Canary's parameterised limit tag", () => {
    expect(parseStoreDescription("{limit|50}")).toEqual([
      {
        icon: "once",
        text: "maximum amount that can be owned by character: 50",
      },
    ]);
  });

  it("keeps plain lines and drops blank ones", () => {
    expect(
      parseStoreDescription("Restores hit points.\n\n{storeinbox}"),
    ).toEqual([
      { icon: null, text: "Restores hit points." },
      {
        icon: "storeinbox",
        text: "will be sent to your Store inbox and can only be stored there and in depot box",
      },
    ]);
  });

  it("drops an unknown tag but keeps the text after it", () => {
    expect(parseStoreDescription("{hirelingskill} something useful")).toEqual([
      { icon: null, text: "something useful" },
    ]);
    expect(parseStoreDescription("{hirelingskill}")).toEqual([]);
  });
});
