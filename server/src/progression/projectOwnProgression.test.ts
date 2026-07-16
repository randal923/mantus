import { ownProgressionStateSchema } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import { projectOwnProgression } from "./projectOwnProgression";

describe("projectOwnProgression", () => {
  it("projects exact status only through the own-player shape", () => {
    const player = new Player(
      makeCharacter("hero", "Hero"),
      { x: 0, y: 0, z: 7 },
      0,
    );
    const own = projectOwnProgression(player);
    const visible = player.toState();

    expect(ownProgressionStateSchema.safeParse(own).success).toBe(true);
    expect(own).toMatchObject({
      level: 1,
      experience: 0,
      health: 150,
      maxHealth: 150,
      mana: 55,
      maxMana: 55,
      capacity: 400,
      magicLevel: 0,
      soul: 100,
    });
    expect(visible).not.toHaveProperty("experience");
    expect(visible).not.toHaveProperty("skills");
    expect(visible).not.toHaveProperty("magicLevel");
    expect(visible).not.toHaveProperty("vocation");
  });
});
