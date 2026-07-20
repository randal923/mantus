import { z } from "zod";
import { positionSchema } from "./position";

export const DAMAGE_TYPES = [
  "physical",
  "energy",
  "earth",
  "fire",
  "life-drain",
  "mana-drain",
  "drown",
  "ice",
  "holy",
  "death",
  "healing",
] as const;

export const COMBAT_ORIGINS = [
  "melee",
  "distance",
  "wand",
  "spell",
  "rune",
  "condition",
  "monster",
] as const;

export const AREA_SHAPES = [
  "single",
  "circle",
  "beam",
  "cone",
  "tiles",
] as const;

export const HIT_BLOCKS = [
  "none",
  "miss",
  "armor",
  "shield",
  "immunity",
] as const;

export const CONDITION_TYPES = [
  "haste",
  "paralyze",
  "poison",
  "fire",
  "energy",
  "bleeding",
  "curse",
  "dazzled",
  "regeneration",
  "invisible",
  "light",
  "outfit",
  "drunk",
  "mute",
  "magic-shield",
  "combat-lock",
  "pz-lock",
] as const;

export const FIGHT_ATTACK_MODES = [
  "offensive",
  "balanced",
  "defensive",
] as const;

export const damageTypeSchema = z.enum(DAMAGE_TYPES);
export const combatOriginSchema = z.enum(COMBAT_ORIGINS);
export const areaShapeSchema = z.enum(AREA_SHAPES);
export const hitBlockSchema = z.enum(HIT_BLOCKS);
export const conditionTypeSchema = z.enum(CONDITION_TYPES);
export const fightAttackModeSchema = z.enum(FIGHT_ATTACK_MODES);

export const combatTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("self") }).strict(),
  z.object({ kind: z.literal("attack-target") }).strict(),
  z.object({ kind: z.literal("direction") }).strict(),
  z
    .object({
      kind: z.literal("creature"),
      creatureId: z.string().min(1).max(192),
    })
    .strict(),
  z
    .object({
      kind: z.literal("position"),
      position: positionSchema,
    })
    .strict(),
]);

export const spellTargetKindSchema = z.enum([
  "self",
  "target",
  "target-or-direction",
  "direction",
  "position",
]);

export const spellCatalogEntrySchema = z
  .object({
    id: z.string().min(1).max(96),
    origin: z.enum(["spell", "rune"]),
    runeItemTypeId: z.number().int().positive().max(65_535).nullable(),
    name: z.string().min(1).max(96),
    words: z.string().min(1).max(96).nullable(),
    damageType: damageTypeSchema,
    effectId: z.number().int().nonnegative().max(65_535),
    manaCost: z.number().int().min(0).max(100_000),
    soulCost: z.number().int().min(0).max(200),
    requiredLevel: z.number().int().min(0).max(10_000),
    requiredMagicLevel: z.number().int().min(0).max(1_000),
    needWeapon: z.boolean(),
    cooldownMs: z.number().int().min(0).max(60 * 60 * 1000),
    cooldownGroups: z.array(z.string().min(1).max(128)).min(1).max(8),
    targetKind: spellTargetKindSchema,
  })
  .strict();

export const fightModeSchema = z
  .object({
    attack: fightAttackModeSchema,
    chase: z.boolean(),
    secure: z.boolean(),
  })
  .strict();

export const DEFAULT_FIGHT_MODE = {
  attack: "offensive",
  chase: false,
  secure: true,
} as const satisfies z.infer<typeof fightModeSchema>;

export const combatConditionStateSchema = z
  .object({
    type: conditionTypeSchema,
    remainingMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
    stacks: z.number().int().min(1).max(3),
  })
  .strict();

export const combatCooldownStateSchema = z
  .object({
    group: z.string().min(1).max(64),
    readyAt: z.number().int().nonnegative(),
    totalMs: z.number().int().positive().max(60 * 60 * 1000),
  })
  .strict();

/** The session player's own persistent skull, shown in the HUD with a timer. */
export const ownSkullStateSchema = z
  .object({
    kind: z.enum(["white", "red", "black"]),
    remainingMs: z
      .number()
      .int()
      .min(0)
      .max(30 * 24 * 60 * 60 * 1000)
      .nullable(),
  })
  .strict();

export const fightStateSchema = z
  .object({
    attackTargetId: z.string().min(1).max(192).nullable(),
    mode: fightModeSchema,
    conditions: z.array(combatConditionStateSchema).max(CONDITION_TYPES.length),
    cooldowns: z.array(combatCooldownStateSchema).max(16),
    skull: ownSkullStateSchema.optional(),
  })
  .strict();

export type DamageType = z.infer<typeof damageTypeSchema>;
export type CombatOrigin = z.infer<typeof combatOriginSchema>;
export type AreaShape = z.infer<typeof areaShapeSchema>;
export type HitBlock = z.infer<typeof hitBlockSchema>;
export type ConditionType = z.infer<typeof conditionTypeSchema>;
export type CombatTarget = z.infer<typeof combatTargetSchema>;
export type SpellCatalogEntry = z.infer<typeof spellCatalogEntrySchema>;
export type FightMode = z.infer<typeof fightModeSchema>;
export type CombatConditionState = z.infer<
  typeof combatConditionStateSchema
>;
export type CombatCooldownState = z.infer<
  typeof combatCooldownStateSchema
>;
export type OwnSkullState = z.infer<typeof ownSkullStateSchema>;
export type FightState = z.infer<typeof fightStateSchema>;
