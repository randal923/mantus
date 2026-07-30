import { describe, expect, it } from "vitest";
import { clientMessageSchema, serverMessageSchema } from "@tibia/protocol";

const parse = (message: unknown) => clientMessageSchema.safeParse(message);

describe("look intent schema", () => {
  it("accepts a creature target and a tile target with or without an item id", () => {
    expect(
      parse({ type: "look", target: { kind: "creature", creatureId: "m1" } })
        .success,
    ).toBe(true);
    expect(
      parse({
        type: "look",
        target: { kind: "map", position: { x: 1, y: 2, z: 7 } },
      }).success,
    ).toBe(true);
    expect(
      parse({
        type: "look",
        target: { kind: "map", position: { x: 1, y: 2, z: 7 }, itemId: 3_031 },
      }).success,
    ).toBe(true);
  });

  it("rejects out-of-range ids, unknown target kinds, and extra fields", () => {
    expect(
      parse({
        type: "look",
        target: { kind: "map", position: { x: 1, y: 2, z: 7 }, itemId: 70_000 },
      }).success,
    ).toBe(false);
    expect(
      parse({
        type: "look",
        target: { kind: "map", position: { x: 1, y: 2, z: 7 }, itemId: 0 },
      }).success,
    ).toBe(false);
    expect(
      parse({ type: "look", target: { kind: "inventory", itemId: "x" } }).success,
    ).toBe(false);
    expect(
      parse({
        type: "look",
        target: { kind: "creature", creatureId: "m1" },
        text: "You see a rat.",
      }).success,
    ).toBe(false);
    expect(parse({ type: "look" }).success).toBe(false);
  });
});

describe("look-text message schema", () => {
  it("accepts the multi-line description Canary composes", () => {
    expect(
      serverMessageSchema.safeParse({
        type: "look-text",
        text: "You see a fire sword (Atk:24).\nIt weighs 23.00 oz.",
      }).success,
    ).toBe(true);
  });

  it("rejects empty text, control characters, and oversized lines", () => {
    expect(
      serverMessageSchema.safeParse({ type: "look-text", text: "" }).success,
    ).toBe(false);
    expect(
      serverMessageSchema.safeParse({
        type: "look-text",
        text: `You see a rat.${String.fromCharCode(7)}`,
      }).success,
    ).toBe(false);
    expect(
      serverMessageSchema.safeParse({
        type: "look-text",
        text: "x".repeat(1_025),
      }).success,
    ).toBe(false);
  });
});
