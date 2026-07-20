import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";

describe("UI settings intent schema", () => {
  it("accepts a bounded chat pin preference", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "update-ui-settings",
        settings: { chatPinnedOpen: true },
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
        settings: { arbitrary: true },
      }).success,
    ).toBe(false);
  });
});
