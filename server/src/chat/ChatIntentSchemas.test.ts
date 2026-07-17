import { describe, expect, it } from "vitest";
import { clientMessageSchema, PROTOCOL_LIMITS } from "@tibia/protocol";

describe("chat intent schemas", () => {
  it("accepts bounded local speech in every mode", () => {
    for (const mode of ["say", "whisper", "yell"]) {
      expect(
        clientMessageSchema.safeParse({
          type: "speak",
          mode,
          text: "hello there",
        }).success,
      ).toBe(true);
    }
    expect(
      clientMessageSchema.safeParse({
        type: "speak",
        mode: "say",
        text: "a".repeat(PROTOCOL_LIMITS.maxChatTextLength),
      }).success,
    ).toBe(true);
  });

  it("rejects empty, oversized, and control-character speech", () => {
    const valid = { type: "speak", mode: "say", text: "hi" };
    expect(
      clientMessageSchema.safeParse({ ...valid, text: "" }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...valid,
        text: "a".repeat(PROTOCOL_LIMITS.maxChatTextLength + 1),
      }).success,
    ).toBe(false);
    for (const text of ["line\nbreak", "tab\there", "nul\u0000", "esc\u001B[31m"]) {
      expect(
        clientMessageSchema.safeParse({ ...valid, text }).success,
      ).toBe(false);
    }
  });

  it("rejects forged sender fields and unknown modes", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "speak",
        mode: "say",
        text: "hi",
        sender: "Someone Else",
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "speak",
        mode: "broadcast",
        text: "hi",
      }).success,
    ).toBe(false);
  });

  it("bounds private message recipients and rejects extra fields", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "private-chat",
        to: "Alice",
        text: "psst",
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "private-chat",
        to: "ab",
        text: "psst",
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "private-chat",
        to: "a".repeat(PROTOCOL_LIMITS.maxCharacterNameLength + 1),
        text: "psst",
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "private-chat",
        to: "Alice",
        text: "psst",
        from: "Forged Name",
      }).success,
    ).toBe(false);
  });
});
