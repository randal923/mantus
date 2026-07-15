import { describe, expect, it } from "vitest";
import { getBrowserLanguage } from "./getBrowserLanguage";

describe("getBrowserLanguage", () => {
  it.each(["pt", "pt-BR", "pt-PT", "PT-br"])(
    "uses Brazilian Portuguese for %s",
    (language) => {
      expect(getBrowserLanguage(language)).toBe("pt-BR");
    },
  );

  it.each(["en", "en-US", "es", "fr", ""])(
    "defaults %s to English",
    (language) => {
      expect(getBrowserLanguage(language)).toBe("en");
    },
  );
});
