import { describe, expect, it } from "vitest";
import type { CreatureOutfit } from "@tibia/protocol";
import { Monster } from "../creature/Monster";
import type { MonsterType } from "../creature/MonsterType";
import { Npc } from "../creature/Npc";
import type { NpcType } from "../creature/NpcType";
import { Player } from "../Player";
import { getExperienceForLevel } from "../progression/getExperienceForLevel";
import { makeCharacter } from "../test/makeCharacter";
import { describeCreatureLook } from "./describeCreatureLook";

const OUTFIT: CreatureOutfit = {
  lookType: 111,
  head: 0,
  body: 0,
  legs: 0,
  feet: 0,
  addons: 0,
};
const POSITION = { x: 1, y: 1, z: 7 } as const;
const NO_STATE = { party: null, guild: null } as const;

function makePlayer(options: {
  name: string;
  vocation: "Knight" | "Master Sorcerer" | "Elder Druid";
  sex: "male" | "female";
  level: number;
}): Player {
  return new Player(
    {
      ...makeCharacter("player-id", options.name),
      vocation: options.vocation,
      sex: options.sex,
      level: options.level,
      experience: BigInt(getExperienceForLevel(options.level)),
    },
    POSITION,
  );
}

describe("describeCreatureLook", () => {
  it("reads a monster's name description, not its display name", () => {
    const monster = new Monster({
      id: "m1",
      type: {
        id: "chicken",
        name: "Chicken",
        description: "a chicken",
        outfit: OUTFIT,
        health: 15,
        maxHealth: 15,
      } as MonsterType,
      position: POSITION,
      direction: "south",
      home: POSITION,
      spawnRadius: 1,
    });
    expect(describeCreatureLook(monster, false, NO_STATE)).toBe("a chicken.");
  });

  it("reads an NPC's description", () => {
    const npc = new Npc({
      id: "n1",
      type: {
        id: "bank-clerk",
        name: "Nilsor",
        description: "Nilsor, a bank clerk",
        outfit: OUTFIT,
        health: 100,
        maxHealth: 100,
        speed: 100,
      } as NpcType,
      position: POSITION,
      direction: "south",
      home: POSITION,
      spawnRadius: 1,
    });
    expect(describeCreatureLook(npc, false, NO_STATE)).toBe(
      "Nilsor, a bank clerk.",
    );
  });

  it("reports another player's level and vocation with their pronoun", () => {
    const player = makePlayer({
      name: "Shui Sorc",
      vocation: "Master Sorcerer",
      sex: "male",
      level: 214,
    });
    expect(describeCreatureLook(player, false, NO_STATE)).toBe(
      "Shui Sorc (Level 214). He is a master sorcerer.",
    );
  });

  it("uses 'She' for a female character and 'an' before a vowel", () => {
    const player = makePlayer({
      name: "Mira",
      vocation: "Elder Druid",
      sex: "female",
      level: 90,
    });
    expect(describeCreatureLook(player, false, NO_STATE)).toBe(
      "Mira (Level 90). She is an elder druid.",
    );
  });

  it("switches to second person when looking at yourself", () => {
    const player = makePlayer({
      name: "Shui Sorc",
      vocation: "Master Sorcerer",
      sex: "male",
      level: 214,
    });
    expect(describeCreatureLook(player, true, NO_STATE)).toBe(
      "yourself. You are a master sorcerer.",
    );
  });

  it("appends live party and guild lines", () => {
    const player = makePlayer({
      name: "Shui Sorc",
      vocation: "Knight",
      sex: "male",
      level: 8,
    });
    expect(
      describeCreatureLook(player, false, {
        party: { members: 3, invitations: 1 },
        guild: { rankName: "Leader", guildName: "Red Rose" },
      }),
    ).toBe(
      "Shui Sorc (Level 8). He is a knight. He is in a party with 3 members and 1 pending invitation. He is Leader of the Red Rose.",
    );
  });

  it("uses singular wording for a two-member party of one", () => {
    const player = makePlayer({
      name: "Solo",
      vocation: "Knight",
      sex: "male",
      level: 8,
    });
    expect(
      describeCreatureLook(player, true, {
        party: { members: 1, invitations: 0 },
        guild: null,
      }),
    ).toBe(
      "yourself. You are a knight. Your party has 1 member and 0 pending invitations.",
    );
  });
});
