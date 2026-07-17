import { describe, expect, it } from "vitest";
import { parseChatInput } from "./parseChatInput";

describe("parseChatInput", () => {
  it("defaults to say", () => {
    expect(parseChatInput("hello there")).toEqual({
      mode: "say",
      text: "hello there",
    });
  });

  it("maps Tibia-style prefixes case-insensitively", () => {
    expect(parseChatInput("#y help me")).toEqual({
      mode: "yell",
      text: "help me",
    });
    expect(parseChatInput("#W psst")).toEqual({
      mode: "whisper",
      text: "psst",
    });
    expect(parseChatInput("#s hi")).toEqual({ mode: "say", text: "hi" });
  });

  it("treats a prefix without a following space as plain speech", () => {
    expect(parseChatInput("#yell-ish words")).toEqual({
      mode: "say",
      text: "#yell-ish words",
    });
  });

  it("strips control characters the protocol rejects", () => {
    expect(parseChatInput("hi\u0000 there\u001B[31m")).toEqual({
      mode: "say",
      text: "hi  there [31m",
    });
  });
});
