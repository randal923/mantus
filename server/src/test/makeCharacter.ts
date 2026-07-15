import type { Character } from "../character/Character";

export function makeCharacter(id: string, displayName = id): Character {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id,
    accountId: "account-id",
    displayName,
    normalizedName: displayName.toLowerCase(),
    vocation: "Knight",
    level: 1,
    experience: 0n,
    health: 150,
    maxHealth: 150,
    mana: 55,
    maxMana: 55,
    capacity: 400,
    positionX: 0,
    positionY: 0,
    positionZ: 7,
    direction: "south",
    outfit: {
      lookType: 128,
      head: 78,
      body: 68,
      legs: 58,
      feet: 76,
      addons: 0,
    },
    townId: 1,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
    version: 1,
  };
}
