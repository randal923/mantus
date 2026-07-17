import { describe, expect, it } from "vitest";
import { matchesNpcDialogueInput } from "./matchesNpcDialogueInput";

describe("matchesNpcDialogueInput", () => {
  it("matches whole ordered words and not substrings", () => {
    expect(matchesNpcDialogueInput("hi captain", [["hi"]])).toBe(true);
    expect(matchesNpcDialogueInput("this captain", [["hi"]])).toBe(false);
    expect(
      matchesNpcDialogueInput("take me to Port Hope", [["port", "hope"]]),
    ).toBe(true);
    expect(
      matchesNpcDialogueInput("hope lies beyond the port", [["port", "hope"]]),
    ).toBe(false);
  });
});
