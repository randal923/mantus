import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";

describe("UI settings intent schema", () => {
  it("accepts bounded account UI preferences", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "update-ui-settings",
        settings: {
          chatPinnedOpen: true,
          turnModifier: "Alt",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects invalid and unknown preferences", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "update-ui-settings",
        settings: { chatPinnedOpen: "yes" },
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "update-ui-settings",
        settings: { turnModifier: "CapsLock" },
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "update-ui-settings",
        settings: { arbitrary: true },
      }).success,
    ).toBe(false);
  });
});
