import { describe, expect, it } from "vitest";
import { clientMessageSchema } from "@tibia/protocol";

describe("combat intent schemas", () => {
  it("accepts bounded target and cancel intents", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "attack-target",
        creatureId: "monster-instance:rat:0",
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({ type: "cancel-attack" }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "set-fight-mode",
        mode: { attack: "offensive", chase: false, secure: true },
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "cast-spell",
        spellId: "energy-strike",
        target: { kind: "attack-target" },
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "use-rune",
        itemId: "00000000-0000-4000-8000-000000000001",
        revision: 1,
        target: { kind: "self" },
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "use-potion",
        itemId: "00000000-0000-4000-8000-000000000001",
        revision: 1,
        targetPlayerId: "00000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(true);
    expect(
      clientMessageSchema.safeParse({
        type: "update-potion-action-bar",
        potionActionBar: [
          { itemTypeId: 266, targetMode: "self" },
          { itemTypeId: 268, targetMode: "attack-target" },
          { itemTypeId: 7642, targetMode: "cursor" },
          { itemTypeId: 23374, targetMode: "crosshair" },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects client-authored combat outcomes and oversized target ids", () => {
    expect(
      clientMessageSchema.safeParse({
        type: "attack-target",
        creatureId: "monster-instance:rat:0",
        damage: 999_999,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "attack-target",
        creatureId: "x".repeat(193),
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "cancel-attack",
        creatureId: "monster-instance:rat:0",
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "cast-spell",
        spellId: "energy-strike",
        target: { kind: "attack-target" },
        damage: 999_999,
        mana: 0,
        cooldownComplete: true,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "use-rune",
        itemId: "00000000-0000-4000-8000-000000000001",
        revision: 1,
        target: { kind: "position", position: { x: -1, y: 0, z: 7 } },
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "use-potion",
        itemId: "00000000-0000-4000-8000-000000000001",
        revision: 1,
        targetPlayerId: "00000000-0000-4000-8000-000000000002",
        healthRestore: 999_999,
      }).success,
    ).toBe(false);
    expect(
      clientMessageSchema.safeParse({
        type: "update-potion-action-bar",
        potionActionBar: [
          { itemTypeId: 266, targetMode: "client-decides" },
        ],
      }).success,
    ).toBe(false);
  });
});
