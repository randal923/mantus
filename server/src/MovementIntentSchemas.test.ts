import { describe, expect, it } from "vitest";
import { clientMessageSchema, PROTOCOL_LIMITS } from "@tibia/protocol";

describe("movement intent schemas", () => {
  it("accepts a destination-only walk-to intent", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "walk-to",
        position: { x: 100, y: 200, z: 7 },
      }).success,
    ).toBe(true);
    for (const intent of [
      // The client never supplies a route, a step count, or a revision.
      {
        type: "walk-to",
        position: { x: 1, y: 1, z: 7 },
        directions: ["north"],
      },
      { type: "walk-to" },
      { type: "walk-to", position: { x: 1, y: 1 } },
      { type: "walk-to", position: { x: -1, y: 1, z: 7 } },
      { type: "walk-to", position: { x: 1, y: 1, z: 16 } },
    ]) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(false);
    }
  });

  it("accepts bounded minimap marker intents only", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "minimap-marker-set",
        position: { x: 1, y: 1, z: 7 },
        icon: 0,
        text: "here",
      }).success,
    ).toBe(true);
    for (const intent of [
      {
        type: "minimap-marker-set",
        position: { x: 1, y: 1, z: 7 },
        icon: 21,
        text: "",
      },
      {
        type: "minimap-marker-set",
        position: { x: 1, y: 1, z: 7 },
        icon: 0,
        text: "a".repeat(41),
      },
      { type: "minimap-marker-delete" },
    ]) {
      expect(clientMessageSchema.safeParse(intent).success).toBe(false);
    }
  });

  it("accepts a direction-only turn intent", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "turn",
        direction: "north",
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "turn",
        direction: "north",
        position: { x: 1, y: 1, z: 7 },
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "turn",
        direction: "up",
      }).success,
    ).toBe(false);
  });

  it("accepts bounded diagonal auto-walk directions without coordinates", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "auto-walk",
        positionRevision: 12,
        directions: ["northeast", "east"],
      }).success,
    ).toBe(true);
  });

  it("rejects empty, oversized, malformed, and destination-authored paths", () => {
    const valid = {
      type: "auto-walk",
      positionRevision: 12,
      directions: ["north"],
    };
    expect(
      clientMessageSchema.safeParse({ ...valid, directions: [] }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...valid,
        directions: Array.from(
          { length: PROTOCOL_LIMITS.maxAutoWalkSteps + 1 },
          () => "north",
        ),
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...valid,
        directions: ["teleport"],
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        ...valid,
        destination: { x: 100, y: 100, z: 7 },
      }).success,
    ).toBe(false);
  });
});
