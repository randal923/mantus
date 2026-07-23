import { describe, expect, it } from "vitest";
import { clientMessageSchema, PROTOCOL_LIMITS } from "@tibia/protocol";

describe("movement intent schemas", () => {
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
