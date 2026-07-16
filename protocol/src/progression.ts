import { z } from "zod";

export const SKILLS = [
  "fist",
  "club",
  "sword",
  "axe",
  "distance",
  "shielding",
  "fishing",
] as const;

export const MAX_CHARACTER_LEVEL = 1_000;
export const MAX_MAGIC_LEVEL = 200;
export const MAX_SKILL_LEVEL = 200;
export const MIN_SKILL_LEVEL = 10;
export const MAX_PROGRESSION_VALUE = Number.MAX_SAFE_INTEGER;

export const skillSchema = z.enum(SKILLS);

export const characterSkillStateSchema = z.object({
  skill: skillSchema,
  level: z.number().int().min(MIN_SKILL_LEVEL).max(MAX_SKILL_LEVEL),
  tries: z.number().int().min(0).max(MAX_PROGRESSION_VALUE),
  triesForNextLevel: z.number().int().min(0).max(MAX_PROGRESSION_VALUE),
});

export const ownProgressionStateSchema = z.object({
  definitionVersion: z.number().int().positive(),
  level: z.number().int().min(1).max(MAX_CHARACTER_LEVEL),
  experience: z.number().int().min(0).max(MAX_PROGRESSION_VALUE),
  experienceForCurrentLevel: z
    .number()
    .int()
    .min(0)
    .max(MAX_PROGRESSION_VALUE),
  experienceForNextLevel: z
    .number()
    .int()
    .min(0)
    .max(MAX_PROGRESSION_VALUE),
  magicLevel: z.number().int().min(0).max(MAX_MAGIC_LEVEL),
  manaSpent: z.number().int().min(0).max(MAX_PROGRESSION_VALUE),
  manaSpentForNextMagicLevel: z
    .number()
    .int()
    .min(0)
    .max(MAX_PROGRESSION_VALUE),
  health: z.number().int().nonnegative(),
  maxHealth: z.number().int().positive(),
  mana: z.number().int().nonnegative(),
  maxMana: z.number().int().nonnegative(),
  capacity: z.number().int().nonnegative(),
  soul: z.number().int().min(0).max(200),
  maxSoul: z.number().int().min(0).max(200),
  speed: z.number().int().positive(),
  attackSpeedMs: z.number().int().positive(),
  healthRegeneration: z.object({
    amount: z.number().int().positive(),
    intervalMs: z.number().int().positive(),
  }),
  manaRegeneration: z.object({
    amount: z.number().int().positive(),
    intervalMs: z.number().int().positive(),
  }),
  soulRegeneration: z.object({
    amount: z.number().int().positive(),
    intervalMs: z.number().int().positive(),
  }),
  skills: z.array(characterSkillStateSchema).length(SKILLS.length),
});

export type Skill = z.infer<typeof skillSchema>;
export type CharacterSkillState = z.infer<typeof characterSkillStateSchema>;
export type OwnProgressionState = z.infer<typeof ownProgressionStateSchema>;
