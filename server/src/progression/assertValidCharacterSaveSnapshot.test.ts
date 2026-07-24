import { describe, expect, it } from "vitest";
import { Player } from "../Player";
import { makeCharacter } from "../test/makeCharacter";
import type { CharacterSaveSnapshot } from "../character/Character";
import { assertValidCharacterSaveSnapshot } from "./assertValidCharacterSaveSnapshot";

describe("assertValidCharacterSaveSnapshot", () => {
  it("rejects invalid progress before persistence", () => {
    const character = makeCharacter("hero");
    const player = new Player(character, { x: 0, y: 0, z: 7 }, 0);
    const snapshot: CharacterSaveSnapshot = {
      characterId: player.id,
      expectedVersion: player.version,
      vocation: player.vocation,
      progressionDefinitionVersion: player.progression.definitionVersion,
      level: player.level,
      experience: BigInt(player.experience),
      magicLevel: player.progression.magicLevel,
      manaSpent: BigInt(player.progression.manaSpent),
      health: player.health,
      mana: player.mana,
      soul: player.progression.soul,
      skills: player.progression.skills,
      skillsChanged: true,
      progressionEvents: [],
      storageValues: player.storageSnapshot,
      storageChanged: true,
      positionX: player.position.x,
      positionY: player.position.y,
      positionZ: player.position.z,
      direction: player.direction,
      outfit: player.outfit,
      skull: player.skull,
      skullExpiresAt:
        player.skullExpiresAt === null ? null : new Date(player.skullExpiresAt),
    };

    expect(() =>
      assertValidCharacterSaveSnapshot({
        ...snapshot,
        experience: -1n,
      }),
    ).toThrow("character snapshot experience is invalid");
    expect(() =>
      assertValidCharacterSaveSnapshot({
        ...snapshot,
        skills: snapshot.skills.map((skill) =>
          skill.skill === "sword"
            ? { ...skill, tries: Number.MAX_SAFE_INTEGER }
            : skill,
        ),
      }),
    ).toThrow("character snapshot skill progress is invalid");
    expect(() =>
      assertValidCharacterSaveSnapshot({
        ...snapshot,
        progressionEvents: [
          { id: "duplicate", type: "experience" },
          { id: "duplicate", type: "skill" },
        ],
      }),
    ).toThrow("character snapshot progression event is invalid");
  });
});
