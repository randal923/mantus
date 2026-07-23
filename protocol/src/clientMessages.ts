import { z } from "zod";
import {
  actionBarSchema,
  autoPotionSettingsSchema,
  potionActionBarSchema,
} from "./actionBar";
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
import { uiSettingsSchema } from "./uiSettings";
import { PROTOCOL_LIMITS } from "./limits";
import {
  marketAcceptOfferMessageSchema,
  marketBrowseMessageSchema,
  marketCancelOfferMessageSchema,
  marketCreateOfferMessageSchema,
  marketOpenMessageSchema,
  marketOwnHistoryMessageSchema,
  marketOwnOffersMessageSchema,
} from "./market";
import {
  guildChatMessageSchema,
  guildCreateMessageSchema,
  guildDeclareWarMessageSchema,
  guildDemoteMessageSchema,
  guildDisbandMessageSchema,
  guildEndWarMessageSchema,
  guildInviteMessageSchema,
  guildKickMessageSchema,
  guildLeaveMessageSchema,
  guildOpenMessageSchema,
  guildPassLeadershipMessageSchema,
  guildPromoteMessageSchema,
  guildRespondInviteMessageSchema,
  guildRespondWarMessageSchema,
  guildRevokeInviteMessageSchema,
  guildSetMotdMessageSchema,
  guildSetNickMessageSchema,
  guildSetRankNameMessageSchema,
} from "./guild";
import {
  bestiaryCreaturesGetMessageSchema,
  bestiaryMonsterGetMessageSchema,
  bosstiaryBossGetMessageSchema,
  bosstiaryGetMessageSchema,
  wikiItemSourcesGetMessageSchema,
} from "./bestiary";
import { highscoresGetMessageSchema } from "./highscores";
import { wheelGetMessageSchema, wheelSaveMessageSchema } from "./wheel";
import {
  gemActionMessageSchema,
  gemGetMessageSchema,
} from "./gemAtelierMessages";
import {
  houseAbandonMessageSchema,
  houseBrowseMessageSchema,
  houseBuyMessageSchema,
  houseKickMessageSchema,
  houseOpenMessageSchema,
  houseSetAccessMessageSchema,
  houseTransferCancelMessageSchema,
  houseTransferOfferMessageSchema,
  houseTransferRespondMessageSchema,
} from "./house";
import { reportPlayerMessageSchema } from "./moderation";
import {
  npcDialogueChoiceMessageSchema,
  npcDialogueGreetMessageSchema,
} from "./npc";
import {
  partyChatMessageSchema,
  partyInviteMessageSchema,
  partyKickMessageSchema,
  partyLeaveMessageSchema,
  partyPassLeadershipMessageSchema,
  partyRespondInviteMessageSchema,
  partyRevokeInviteMessageSchema,
  partySetSharedExpMessageSchema,
} from "./party";
import { shopBuyMessageSchema, shopSellMessageSchema } from "./shop";
import {
  storeOpenMessageSchema,
  storePurchaseMessageSchema,
} from "./store";
import {
  tradeAcceptMessageSchema,
  tradeCancelMessageSchema,
  tradeRequestMessageSchema,
} from "./trade";
import { equipmentSlotSchema } from "./item";
import { positionSchema } from "./position";
import { viewRangeSchema } from "./viewRange";
import {
  vipAddMessageSchema,
  vipEditMessageSchema,
  vipRemoveMessageSchema,
} from "./vip";

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

/** Fixed-size turn intent covered by the shared message-size and rate caps. */
export const turnMessageSchema = z
  .object({
    type: z.literal("turn"),
    direction: z.enum(DIRECTIONS),
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
    /** Atomically shifts the occupied prefix so this item lands in slot 0. */
    placement: z.literal("front").optional(),
  })
  .strict();

/** Consumes one owned rune only after its revision and target are revalidated. */
export const useRuneMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("use-rune"),
    target: combatTargetSchema,
  })
  .strict();

/**
 * Uses one owned restorative potion on a selected player. The packet is
 * intentionally limited to identity and revision data; restore amounts,
 * requirements, range, exhaustion, consumption, and flask return are all
 * resolved by the server. Expected rate: at most one accepted use per second.
 */
export const usePotionMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("use-potion"),
    targetPlayerId: z.string().uuid(),
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
 * slot, or — with `equipSlot` — asks the server to pick it up directly into
 * an empty equipment slot. The whole operation is rejected if equipping is
 * not currently valid.
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

/**
 * Drops an owned item or bounded portion of a stack onto a visible tile. The
 * server re-validates the current viewport, line of sight, and tile at
 * execution time.
 */
export const dropItemMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("drop-item"),
    position: positionSchema,
    count: z.number().int().positive().max(100).optional(),
  })
  .strict();

/**
 * Throws a visible map item from an adjacent tile onto another visible tile.
 * Same fixed size and rate expectations as the other item intents; the
 * server re-validates reach, current viewport, line of sight, and the tile at
 * execution time.
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

/**
 * Takes one item out of an open world container (corpse) into the carried
 * inventory. The server re-validates at execution time that the container is
 * open for this session, adjacent, and loot-unprotected; fixed size, covered
 * by the shared rate caps.
 */
export const lootItemMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("loot-item"),
    containerId: z.string().uuid(),
    destination: itemContainerDestinationSchema.optional(),
  })
  .strict();

/** Closes this session's open world container view (corpse). */
export const closeWorldContainerMessageSchema = z
  .object({
    type: z.literal("close-world-container"),
    containerId: z.string().uuid(),
  })
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

/** Moves an owned item into one bounded position of an owned revisioned container. */
export const moveItemMessageSchema = ownedItemIntentSchema
  .extend({
    type: z.literal("move-item"),
    destinationContainerId: z.string().uuid(),
    destinationRevision: z.number().int().positive(),
    destinationSlot: z.number().int().min(0).max(99),
    destinationPlacement: z.literal("front").optional(),
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

/** Bounded account setting intent; covered by the 4 KiB/30-per-second caps. */
export const updateUiSettingsMessageSchema = z.object({
  type: z.literal("update-ui-settings"),
  settings: uiSettingsSchema,
});

/**
 * Bounded per-character spell bar layout intent; spell ids are re-validated
 * against the character's own spell list at execution time.
 */
export const updateActionBarMessageSchema = z.object({
  type: z.literal("update-action-bar"),
  actionBar: actionBarSchema,
});

/** Bounded per-character potion type and client targeting-mode layout. */
export const updatePotionActionBarMessageSchema = z
  .object({
    type: z.literal("update-potion-action-bar"),
    potionActionBar: potionActionBarSchema,
  })
  .strict();

/** Rare, bounded per-character update; automatic use remains server-owned. */
export const updateAutoPotionSettingsMessageSchema = z
  .object({
    type: z.literal("update-auto-potion-settings"),
    settings: autoPotionSettingsSchema,
  })
  .strict();

export const clientMessageSchema = z.discriminatedUnion("type", [
  authMessageSchema,
  listCharactersMessageSchema,
  createCharacterMessageSchema,
  selectCharacterMessageSchema,
  moveMessageSchema,
  turnMessageSchema,
  stopMoveMessageSchema,
  autoWalkMessageSchema,
  setViewportMessageSchema,
  useMapMessageSchema,
  attackTargetMessageSchema,
  cancelAttackMessageSchema,
  setFightModeMessageSchema,
  castSpellMessageSchema,
  useRuneMessageSchema,
  usePotionMessageSchema,
  equipItemMessageSchema,
  unequipItemMessageSchema,
  pickupItemMessageSchema,
  dropItemMessageSchema,
  moveMapItemMessageSchema,
  openContainerMessageSchema,
  closeContainerMessageSchema,
  lootItemMessageSchema,
  closeWorldContainerMessageSchema,
  useItemMessageSchema,
  useItemWithMessageSchema,
  splitStackMessageSchema,
  rotateItemMessageSchema,
  moveItemMessageSchema,
  writeItemMessageSchema,
  setLanguageMessageSchema,
  updateUiSettingsMessageSchema,
  updateActionBarMessageSchema,
  updatePotionActionBarMessageSchema,
  updateAutoPotionSettingsMessageSchema,
  npcDialogueGreetMessageSchema,
  npcDialogueChoiceMessageSchema,
  bankDepositMessageSchema,
  bankWithdrawMessageSchema,
  bankTransferMessageSchema,
  shopBuyMessageSchema,
  shopSellMessageSchema,
  storeOpenMessageSchema,
  storePurchaseMessageSchema,
  depotDepositMessageSchema,
  depotWithdrawMessageSchema,
  depotBrowseMessageSchema,
  stashDepositMessageSchema,
  stashWithdrawMessageSchema,
  closeDepotMessageSchema,
  sendMailMessageSchema,
  closeMailboxMessageSchema,
  marketOpenMessageSchema,
  marketBrowseMessageSchema,
  marketCreateOfferMessageSchema,
  marketAcceptOfferMessageSchema,
  marketCancelOfferMessageSchema,
  marketOwnOffersMessageSchema,
  marketOwnHistoryMessageSchema,
  tradeRequestMessageSchema,
  tradeAcceptMessageSchema,
  tradeCancelMessageSchema,
  partyInviteMessageSchema,
  partyRespondInviteMessageSchema,
  partyRevokeInviteMessageSchema,
  partyLeaveMessageSchema,
  partyKickMessageSchema,
  partyPassLeadershipMessageSchema,
  partySetSharedExpMessageSchema,
  partyChatMessageSchema,
  guildCreateMessageSchema,
  guildInviteMessageSchema,
  guildRespondInviteMessageSchema,
  guildRevokeInviteMessageSchema,
  guildKickMessageSchema,
  guildLeaveMessageSchema,
  guildPromoteMessageSchema,
  guildDemoteMessageSchema,
  guildPassLeadershipMessageSchema,
  guildDisbandMessageSchema,
  guildSetMotdMessageSchema,
  guildSetNickMessageSchema,
  guildSetRankNameMessageSchema,
  guildOpenMessageSchema,
  guildChatMessageSchema,
  guildDeclareWarMessageSchema,
  guildRespondWarMessageSchema,
  guildEndWarMessageSchema,
  houseOpenMessageSchema,
  houseBuyMessageSchema,
  houseAbandonMessageSchema,
  houseTransferOfferMessageSchema,
  houseTransferRespondMessageSchema,
  houseTransferCancelMessageSchema,
  houseSetAccessMessageSchema,
  houseKickMessageSchema,
  houseBrowseMessageSchema,
  vipAddMessageSchema,
  vipRemoveMessageSchema,
  vipEditMessageSchema,
  highscoresGetMessageSchema,
  bestiaryCreaturesGetMessageSchema,
  bestiaryMonsterGetMessageSchema,
  bosstiaryGetMessageSchema,
  bosstiaryBossGetMessageSchema,
  wikiItemSourcesGetMessageSchema,
  wheelGetMessageSchema,
  wheelSaveMessageSchema,
  gemGetMessageSchema,
  gemActionMessageSchema,
  reportPlayerMessageSchema,
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
export type TurnMessage = z.infer<typeof turnMessageSchema>;
export type StopMoveMessage = z.infer<typeof stopMoveMessageSchema>;
export type AutoWalkMessage = z.infer<typeof autoWalkMessageSchema>;
export type SetViewportMessage = z.infer<typeof setViewportMessageSchema>;
export type UseMapMessage = z.infer<typeof useMapMessageSchema>;
export type AttackTargetMessage = z.infer<typeof attackTargetMessageSchema>;
export type CancelAttackMessage = z.infer<typeof cancelAttackMessageSchema>;
export type SetFightModeMessage = z.infer<typeof setFightModeMessageSchema>;
export type CastSpellMessage = z.infer<typeof castSpellMessageSchema>;
export type UseRuneMessage = z.infer<typeof useRuneMessageSchema>;
export type UsePotionMessage = z.infer<typeof usePotionMessageSchema>;
export type ItemContainerDestination = z.infer<
  typeof itemContainerDestinationSchema
>;
export type EquipItemMessage = z.infer<typeof equipItemMessageSchema>;
export type UnequipItemMessage = z.infer<typeof unequipItemMessageSchema>;
export type PickupItemMessage = z.infer<typeof pickupItemMessageSchema>;
export type DropItemMessage = z.infer<typeof dropItemMessageSchema>;
export type OpenContainerMessage = z.infer<typeof openContainerMessageSchema>;
export type CloseContainerMessage = z.infer<typeof closeContainerMessageSchema>;
export type LootItemMessage = z.infer<typeof lootItemMessageSchema>;
export type CloseWorldContainerMessage = z.infer<
  typeof closeWorldContainerMessageSchema
>;
export type UseItemMessage = z.infer<typeof useItemMessageSchema>;
export type UseItemWithMessage = z.infer<typeof useItemWithMessageSchema>;
export type SplitStackMessage = z.infer<typeof splitStackMessageSchema>;
export type RotateItemMessage = z.infer<typeof rotateItemMessageSchema>;
export type MoveItemMessage = z.infer<typeof moveItemMessageSchema>;
export type WriteItemMessage = z.infer<typeof writeItemMessageSchema>;
export type SetLanguageMessage = z.infer<typeof setLanguageMessageSchema>;
export type UpdateUiSettingsMessage = z.infer<
  typeof updateUiSettingsMessageSchema
>;
export type UpdateActionBarMessage = z.infer<
  typeof updateActionBarMessageSchema
>;
export type UpdatePotionActionBarMessage = z.infer<
  typeof updatePotionActionBarMessageSchema
>;
export type UpdateAutoPotionSettingsMessage = z.infer<
  typeof updateAutoPotionSettingsMessageSchema
>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
