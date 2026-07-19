import {
  MAX_CHARACTER_LEVEL,
  MAX_MAGIC_LEVEL,
  MAX_SKILL_LEVEL,
  MIN_SKILL_LEVEL,
  SKILLS,
} from "@tibia/protocol";
import type { CharacterSaveSnapshot } from "../character/Character";
import { deriveCharacterStats } from "./deriveCharacterStats";
import { getExperienceForLevel } from "./getExperienceForLevel";
import { getLevelForExperience } from "./getLevelForExperience";
import { getManaForNextMagicLevel } from "./getManaForNextMagicLevel";
import { getSkillTriesForNextLevel } from "./getSkillTriesForNextLevel";
import { getVocation } from "./getVocation";

const EVENT_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

export function assertValidCharacterSaveSnapshot(
  snapshot: CharacterSaveSnapshot,
): void {
  const experience = Number(snapshot.experience);
  if (
    !Number.isSafeInteger(experience) ||
    experience < 0 ||
    experience > getExperienceForLevel(MAX_CHARACTER_LEVEL) ||
    getLevelForExperience(experience) !== snapshot.level
  ) {
    throw new Error("character snapshot experience is invalid");
  }
  if (
    !Number.isInteger(snapshot.magicLevel) ||
    snapshot.magicLevel < 0 ||
    snapshot.magicLevel > MAX_MAGIC_LEVEL
  ) {
    throw new Error("character snapshot magic level is invalid");
  }
  const vocation = getVocation(
    snapshot.vocation,
    snapshot.progressionDefinitionVersion,
  );
  const manaRequirement = getManaForNextMagicLevel(
    vocation,
    snapshot.magicLevel,
  );
  const manaSpent = Number(snapshot.manaSpent);
  if (
    !Number.isSafeInteger(manaSpent) ||
    manaSpent < 0 ||
    (manaRequirement > 0 && manaSpent >= manaRequirement) ||
    (manaRequirement === 0 && manaSpent !== 0)
  ) {
    throw new Error("character snapshot magic progress is invalid");
  }
  const stats = deriveCharacterStats({
    vocation: snapshot.vocation,
    definitionVersion: snapshot.progressionDefinitionVersion,
    level: snapshot.level,
  });
  if (
    !Number.isInteger(snapshot.health) ||
    snapshot.health < 0 ||
    snapshot.health > stats.maxHealth ||
    !Number.isInteger(snapshot.mana) ||
    snapshot.mana < 0 ||
    snapshot.mana > stats.maxMana ||
    !Number.isInteger(snapshot.soul) ||
    snapshot.soul < 0 ||
    snapshot.soul > vocation.maxSoul
  ) {
    throw new Error("character snapshot current stats are invalid");
  }
  if (snapshot.skills.length !== SKILLS.length) {
    throw new Error("character snapshot skills are incomplete");
  }
  const seenSkills = new Set<string>();
  for (const skill of snapshot.skills) {
    if (
      seenSkills.has(skill.skill) ||
      !Number.isInteger(skill.level) ||
      skill.level < MIN_SKILL_LEVEL ||
      skill.level > MAX_SKILL_LEVEL
    ) {
      throw new Error("character snapshot skill is invalid");
    }
    seenSkills.add(skill.skill);
    const required = getSkillTriesForNextLevel(
      vocation,
      skill.skill,
      skill.level,
    );
    if (
      !Number.isSafeInteger(skill.tries) ||
      skill.tries < 0 ||
      (required > 0 && skill.tries >= required) ||
      (required === 0 && skill.tries !== 0)
    ) {
      throw new Error("character snapshot skill progress is invalid");
    }
  }
  if (
    (snapshot.skull === "none") !== (snapshot.skullExpiresAt === null)
  ) {
    throw new Error("character snapshot skull expiry is invalid");
  }
  const eventIds = new Set<string>();
  for (const event of snapshot.progressionEvents) {
    if (eventIds.has(event.id) || !EVENT_ID_PATTERN.test(event.id)) {
      throw new Error("character snapshot progression event is invalid");
    }
    eventIds.add(event.id);
  }
}
