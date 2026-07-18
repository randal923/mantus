import { z } from "zod";
import {
  bankDepositMessageSchema,
  bankTransferMessageSchema,
  bankWithdrawMessageSchema,
} from "./bank";
import { privateChatMessageSchema, speakMessageSchema } from "./chat";
import { createCharacterInputSchema } from "./character";
import { combatTargetSchema, fightModeSchema } from "./combat";
import {
  closeDepotMessageSchema,
  closeMailboxMessageSchema,
  depotBrowseMessageSchema,
  depotDepositMessageSchema,
  depotWithdrawMessageSchema,
  sendMailMessageSchema,
  stashDepositMessageSchema,
  stashWithdrawMessageSchema,
} from "./depot";
import { DIRECTIONS } from "./direction";
import { languageSchema } from "./language";
import { PROTOCOL_LIMITS } from "./limits";
import { npcDialogueChoiceMessageSchema } from "./npc";
import { shopBuyMessageSchema, shopSellMessageSchema } from "./shop";
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

/**
 * Starts one bounded client-authored path. The server accepts only directions,
 * verifies the starting revision, and revalidates every step in the tick.
 */
export const autoWalkMessageSchema = z
  .object({
    type: z.literal("auto-walk"),
    positionRevision: z.number().int().nonnegative(),
    directions: z
      .array(z.enum(DIRECTIONS))
      .min(1)
      .max(PROTOCOL_LIMITS.maxAutoWalkSteps),
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

/** Selects one server-known creature; normal clients send on right-click. */
export const attackTargetMessageSchema = z
  .object({
    type: z.literal("attack-target"),
    creatureId: z.string().min(1).max(192),
  })
  .strict();

/** Clears the current attack target without supplying any replacement state. */
export const cancelAttackMessageSchema = z
  .object({
    type: z.literal("cancel-attack"),
  })
  .strict();

/** Updates server-owned stance, chase preference, and secure PVP mode. */
export const setFightModeMessageSchema = z
  .object({
    type: z.literal("set-fight-mode"),
    mode: fightModeSchema,
  })
  .strict();

/** Requests one registered spell; requirements and outcomes remain server-owned. */
export const castSpellMessageSchema = z
  .object({
    type: z.literal("cast-spell"),
    spellId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    target: combatTargetSchema,
  })
  .strict();

const ownedItemIntentSchema = z.object({
  itemId: z.string().uuid(),
  revision: z.number().int().positive(),
});

export const itemContainerDestinationSchema = z
  .object({
    containerId: z.string().uuid(),
    containerRevision: z.number().int().positive(),
    slot: z.number().int().min(0).max(99),
  })
  .strict();

/** Consumes one owned rune only after its revision and target are revalidated. */
export const useRuneMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("use-rune"),
    target: combatTargetSchema,
  })
  .strict();

/** Equips one owned item; the server verifies its catalog slot and requirements. */
export const equipItemMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("equip-item"),
    slot: equipmentSlotSchema,
  })
  .strict();

/** Moves equipped gear into a bounded owned container slot or the backpack. */
export const unequipItemMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("unequip-item"),
    slot: equipmentSlotSchema,
    destination: itemContainerDestinationSchema.optional(),
  })
  .strict();

/**
 * Picks up a visible map instance into an optional bounded owned container
 * slot, or — with `equipSlot` — asks the server to equip it right after the
 * pickup commits (the equip is re-validated like any equip intent; if it is
 * not possible the item simply stays picked up).
 */
export const pickupItemMessageSchema = z
  .object({
    type: z.literal("pickup-item"),
    itemId: z.string().min(1).max(128),
    revision: z.number().int().positive(),
    position: positionSchema,
    // destination and equipSlot are mutually exclusive; the server rejects
    // intents carrying both (a refine here would break the discriminated union).
    destination: itemContainerDestinationSchema.optional(),
    equipSlot: equipmentSlotSchema.optional(),
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

/**
 * Throws a visible map item from an adjacent tile onto another nearby tile.
 * Same fixed size and rate expectations as the other item intents; the
 * server re-validates reach, target range, and the tile at execution time.
 */
export const moveMapItemMessageSchema = z
  .object({
    type: z.literal("move-map-item"),
    itemId: z.string().min(1).max(128),
    revision: z.number().int().positive(),
    fromPosition: positionSchema,
    toPosition: positionSchema,
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

/** Moves an owned item into one bounded slot of an owned revisioned container. */
export const moveItemMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("move-item"),
    destinationContainerId: z.string().uuid(),
    destinationRevision: z.number().int().positive(),
    destinationSlot: z.number().int().min(0).max(99),
    count: z.number().int().positive().max(100).optional(),
  })
  .strict();

/** Writes bounded text only to an owned writeable item after revision checks. */
export const writeItemMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("write-item"),
    text: z.string().max(3_997),
  })
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
  autoWalkMessageSchema,
  setViewportMessageSchema,
  useMapMessageSchema,
  attackTargetMessageSchema,
  cancelAttackMessageSchema,
  setFightModeMessageSchema,
  castSpellMessageSchema,
  useRuneMessageSchema,
  equipItemMessageSchema,
  unequipItemMessageSchema,
  pickupItemMessageSchema,
  dropItemMessageSchema,
  moveMapItemMessageSchema,
  openContainerMessageSchema,
  closeContainerMessageSchema,
  useItemMessageSchema,
  useItemWithMessageSchema,
  splitStackMessageSchema,
  rotateItemMessageSchema,
  moveItemMessageSchema,
  writeItemMessageSchema,
  setLanguageMessageSchema,
  npcDialogueChoiceMessageSchema,
  bankDepositMessageSchema,
  bankWithdrawMessageSchema,
  bankTransferMessageSchema,
  shopBuyMessageSchema,
  shopSellMessageSchema,
  depotDepositMessageSchema,
  depotWithdrawMessageSchema,
  depotBrowseMessageSchema,
  stashDepositMessageSchema,
  stashWithdrawMessageSchema,
  closeDepotMessageSchema,
  sendMailMessageSchema,
  closeMailboxMessageSchema,
  speakMessageSchema,
  privateChatMessageSchema,
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
export type AutoWalkMessage = z.infer<typeof autoWalkMessageSchema>;
export type SetViewportMessage = z.infer<typeof setViewportMessageSchema>;
export type UseMapMessage = z.infer<typeof useMapMessageSchema>;
export type AttackTargetMessage = z.infer<typeof attackTargetMessageSchema>;
export type CancelAttackMessage = z.infer<typeof cancelAttackMessageSchema>;
export type SetFightModeMessage = z.infer<typeof setFightModeMessageSchema>;
export type CastSpellMessage = z.infer<typeof castSpellMessageSchema>;
export type UseRuneMessage = z.infer<typeof useRuneMessageSchema>;
export type ItemContainerDestination = z.infer<
  typeof itemContainerDestinationSchema
>;
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
export type MoveItemMessage = z.infer<typeof moveItemMessageSchema>;
export type WriteItemMessage = z.infer<typeof writeItemMessageSchema>;
export type SetLanguageMessage = z.infer<typeof setLanguageMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
