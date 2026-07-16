import { z } from "zod";
import { createCharacterInputSchema } from "./character";
import { DIRECTIONS } from "./direction";
import { languageSchema } from "./language";
import { PROTOCOL_LIMITS } from "./limits";
import { equipmentSlotSchema } from "./item";
import { positionSchema } from "./position";
import { viewRangeSchema } from "./viewRange";

export const authMessageSchema = z.object({
  type: z.literal("auth"),
  token: z
    .string()
    .min(1)
    .max(PROTOCOL_LIMITS.maxTokenLength)
    .regex(/^[A-Za-z0-9_.-]+$/),
  language: languageSchema,
});

/** Fixed-size request; normal clients send once after authentication. */
export const listCharactersMessageSchema = z
  .object({ type: z.literal("list-characters") })
  .strict();

/** At most one create is resolved at a time, under the transport rate cap. */
export const createCharacterMessageSchema = createCharacterInputSchema.extend({
  type: z.literal("create-character"),
});

/** Fixed-size world-entry intent; normal clients send once per selection. */
export const selectCharacterMessageSchema = z
  .object({
    type: z.literal("select-character"),
    characterId: z.string().uuid(),
  })
  .strict();

/** Starts or redirects held movement and optionally buffers the pressed step. */
export const moveMessageSchema = z
  .object({
    type: z.literal("move"),
    direction: z.enum(DIRECTIONS),
    queueStep: z.boolean().default(true),
  })
  .strict();

/** Stops held movement; covered by the shared message size and rate caps. */
export const stopMoveMessageSchema = z
  .object({
    type: z.literal("stop-move"),
  })
  .strict();

/** Updates the bounded tile range derived from the current rendered viewport. */
export const setViewportMessageSchema = z
  .object({
    type: z.literal("set-viewport"),
    range: viewRangeSchema,
  })
  .strict();

/** Uses an adjacent server-authored map action; never supplies a destination. */
export const useMapMessageSchema = z
  .object({
    type: z.literal("use-map"),
    position: positionSchema,
  })
  .strict();

const ownedItemIntentSchema = z.object({
  itemId: z.string().uuid(),
  revision: z.number().int().positive(),
});

/** Equips one owned item; the server verifies its catalog slot and requirements. */
export const equipItemMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("equip-item"),
    slot: equipmentSlotSchema,
  })
  .strict();

/** Moves equipped gear into the currently equipped backpack. */
export const unequipItemMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("unequip-item"),
    slot: equipmentSlotSchema,
  })
  .strict();

/** Picks up a visible map instance; position prevents acting on stale view state. */
export const pickupItemMessageSchema = z
  .object({
    type: z.literal("pickup-item"),
    itemId: z.string().min(1).max(128),
    revision: z.number().int().positive(),
    position: positionSchema,
  })
  .strict();

/** Drops an owned item or bounded portion of a stack on an adjacent tile. */
export const dropItemMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("drop-item"),
    position: positionSchema,
    count: z.number().int().positive().max(100).optional(),
  })
  .strict();

export const openContainerMessageSchema = ownedItemIntentSchema
  .extend({ type: z.literal("open-container") })
  .strict();

export const closeContainerMessageSchema = z
  .object({ type: z.literal("close-container"), containerId: z.string().uuid() })
  .strict();

export const useItemMessageSchema = ownedItemIntentSchema
  .extend({ type: z.literal("use-item") })
  .strict();

export const useItemWithMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("use-item-with"),
    targetPosition: positionSchema,
  })
  .strict();

export const splitStackMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("split-stack"),
    count: z.number().int().positive().max(99),
  })
  .strict();

export const rotateItemMessageSchema = ownedItemIntentSchema
  .extend({ type: z.literal("rotate-item") })
  .strict();

/** Fixed-size account setting intent; covered by the 4 KiB/30-per-second caps. */
export const setLanguageMessageSchema = z.object({
  type: z.literal("set-language"),
  language: languageSchema,
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  authMessageSchema,
  listCharactersMessageSchema,
  createCharacterMessageSchema,
  selectCharacterMessageSchema,
  moveMessageSchema,
  stopMoveMessageSchema,
  setViewportMessageSchema,
  useMapMessageSchema,
  equipItemMessageSchema,
  unequipItemMessageSchema,
  pickupItemMessageSchema,
  dropItemMessageSchema,
  openContainerMessageSchema,
  closeContainerMessageSchema,
  useItemMessageSchema,
  useItemWithMessageSchema,
  splitStackMessageSchema,
  rotateItemMessageSchema,
  setLanguageMessageSchema,
]);

export type AuthMessage = z.infer<typeof authMessageSchema>;
export type ListCharactersMessage = z.infer<
  typeof listCharactersMessageSchema
>;
export type CreateCharacterMessage = z.infer<
  typeof createCharacterMessageSchema
>;
export type SelectCharacterMessage = z.infer<
  typeof selectCharacterMessageSchema
>;
export type MoveMessage = z.infer<typeof moveMessageSchema>;
export type StopMoveMessage = z.infer<typeof stopMoveMessageSchema>;
export type SetViewportMessage = z.infer<typeof setViewportMessageSchema>;
export type UseMapMessage = z.infer<typeof useMapMessageSchema>;
export type EquipItemMessage = z.infer<typeof equipItemMessageSchema>;
export type UnequipItemMessage = z.infer<typeof unequipItemMessageSchema>;
export type PickupItemMessage = z.infer<typeof pickupItemMessageSchema>;
export type DropItemMessage = z.infer<typeof dropItemMessageSchema>;
export type OpenContainerMessage = z.infer<typeof openContainerMessageSchema>;
export type CloseContainerMessage = z.infer<typeof closeContainerMessageSchema>;
export type UseItemMessage = z.infer<typeof useItemMessageSchema>;
export type UseItemWithMessage = z.infer<typeof useItemWithMessageSchema>;
export type SplitStackMessage = z.infer<typeof splitStackMessageSchema>;
export type RotateItemMessage = z.infer<typeof rotateItemMessageSchema>;
export type SetLanguageMessage = z.infer<typeof setLanguageMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
