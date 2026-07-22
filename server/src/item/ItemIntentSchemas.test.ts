import { clientMessageSchema } from "@tibia/protocol";
import { describe, expect, it } from "vitest";

const ITEM_ID = "6dc6d063-1c32-4b4b-bf90-279ef9c5d403";
const CONTAINER_ID = "e7e85634-b626-47d1-b467-5383e292cb81";

describe("item intent schemas", () => {
  it("accepts one explicit bounded container destination", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "pickup-item",
        itemId: "map:100:100:7:1",
        revision: 1,
        position: { x: 100, y: 100, z: 7 },
        destination: {
          containerId: CONTAINER_ID,
          containerRevision: 2,
          slot: 3,
        },
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "move-item",
        itemId: ITEM_ID,
        revision: 1,
        destinationContainerId: CONTAINER_ID,
        destinationRevision: 2,
        destinationSlot: 3,
      }).success,
    ).toBe(true);
  });

  it("accepts only the bounded front-placement marker", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "pickup-item",
        itemId: "map:100:100:7:1",
        revision: 1,
        position: { x: 100, y: 100, z: 7 },
        destination: {
          containerId: CONTAINER_ID,
          containerRevision: 2,
          slot: 0,
          placement: "front",
        },
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "move-item",
        itemId: ITEM_ID,
        revision: 1,
        destinationContainerId: CONTAINER_ID,
        destinationRevision: 2,
        destinationSlot: 0,
        destinationPlacement: "anywhere",
      }).success,
    ).toBe(false);
  });

  it.each([0, -1, 100, 101])("rejects invalid split count %s", (count) => {
    expect(
      clientMessageSchema.safeParse({
        type: "split-stack",
        itemId: ITEM_ID,
        revision: 1,
        count,
      }).success,
    ).toBe(false);
  });

  it.each([0, -1, 101])("rejects invalid drop count %s", (count) => {
    expect(
      clientMessageSchema.safeParse({
        type: "drop-item",
        itemId: ITEM_ID,
        revision: 1,
        position: { x: 100, y: 100, z: 7 },
        count,
      }).success,
    ).toBe(false);
  });

  it("bounds destination slots and rejects invalid item ids", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "move-item",
        itemId: ITEM_ID,
        revision: 1,
        destinationContainerId: CONTAINER_ID,
        destinationRevision: 1,
        destinationSlot: 100,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "equip-item",
        itemId: ITEM_ID,
        revision: 1,
        slot: "weapon",
        destinationSlot: 0,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "unequip-item",
        itemId: "not-a-server-id",
        revision: 1,
        slot: "weapon",
      }).success,
    ).toBe(false);
  });

  it("bounds generic move counts and writeable text", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "move-item",
        itemId: ITEM_ID,
        revision: 1,
        destinationContainerId: CONTAINER_ID,
        destinationRevision: 1,
        destinationSlot: 0,
        count: 101,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "write-item",
        itemId: ITEM_ID,
        revision: 1,
        text: "x".repeat(3_998),
      }).success,
    ).toBe(false);
  });

  it("bounds map item moves to well-formed positions and references", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "move-map-item",
        itemId: "map:100:100:7:1",
        revision: 1,
        fromPosition: { x: 100, y: 100, z: 7 },
        toPosition: { x: 102, y: 101, z: 7 },
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "move-map-item",
        itemId: "map:100:100:7:1",
        revision: 1,
        fromPosition: { x: 100, y: 100, z: 7 },
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "move-map-item",
        itemId: "x".repeat(129),
        revision: 1,
        fromPosition: { x: 100, y: 100, z: 7 },
        toPosition: { x: 102, y: 101, z: 7 },
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "move-map-item",
        itemId: "map:100:100:7:1",
        revision: 0,
        fromPosition: { x: 100, y: 100, z: 7 },
        toPosition: { x: 102, y: 101, z: 7 },
      }).success,
    ).toBe(false);
  });
});
