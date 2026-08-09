import { z } from "zod";
import {
  ACTION_BAR_SLOT_COUNT,
  actionBarSchema,
  actionBotSettingsSchema,
} from "./actionBar";
import {
  bankDepositMessageSchema,
  bankTransferMessageSchema,
  bankWithdrawMessageSchema,
} from "./bank";
import {
  channelCloseMessageSchema,
  channelListGetMessageSchema,
  channelOpenMessageSchema,
  channelSpeakMessageSchema,
  ignoreAddMessageSchema,
  ignoreRemoveMessageSchema,
  chatTypingMessageSchema,
  privateChatMessageSchema,
  speakMessageSchema,
} from "./chat";
import { createCharacterInputSchema } from "./character";
import {
  AIM_AT_TARGET_SPELL_LIMIT,
  combatTargetSchema,
  fightModeSchema,
} from "./combat";
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
import {
  lootFilterItemsGetMessageSchema,
  updateLootFilterMessageSchema,
} from "./lootFilter";
import { lookMessageSchema } from "./look";
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
  guildDepositMessageSchema,
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
  guildWithdrawMessageSchema,
} from "./guild";
import {
  bestiaryCreaturesGetMessageSchema,
  bestiaryMonsterGetMessageSchema,
  bosstiaryBossGetMessageSchema,
  bosstiaryGetMessageSchema,
  trackerSetMessageSchema,
  wikiItemSourcesGetMessageSchema,
} from "./bestiary";
import {
  bossSlotSetMessageSchema,
  bossSlotsGetMessageSchema,
} from "./bosstiarySlots";
import {
  forgeConversionMessageSchema,
  forgeFusionMessageSchema,
  forgeGetMessageSchema,
  forgeHistoryGetMessageSchema,
  forgeTransferMessageSchema,
} from "./forge";
import {
  imbuementApplyMessageSchema,
  imbuementClearMessageSchema,
  imbuementScrollApplyMessageSchema,
  imbuementScrollCreateMessageSchema,
  imbuementWindowGetMessageSchema,
} from "./imbuements";
import {
  proficiencyGetMessageSchema,
  proficiencySelectMessageSchema,
} from "./proficiency";
import { cyclopediaCharacterGetMessageSchema } from "./cyclopedia";
import { highscoresGetMessageSchema } from "./highscores";
import { wheelGetMessageSchema, wheelSaveMessageSchema } from "./wheel";
import {
  gemActionMessageSchema,
  gemGetMessageSchema,
} from "./gemAtelierMessages";
import {
  houseAbandonMessageSchema,
  houseBidMessageSchema,
  houseBrowseMessageSchema,
  houseBuyMessageSchema,
  houseKickMessageSchema,
  houseOpenMessageSchema,
  houseSetAccessMessageSchema,
  houseSetListMessageSchema,
  houseTransferCancelMessageSchema,
  houseTransferOfferMessageSchema,
  houseTransferRespondMessageSchema,
} from "./house";
import {
  minimapMarkerDeleteMessageSchema,
  minimapMarkerSetMessageSchema,
  walkToMessageSchema,
} from "./minimap";
import {
  outfitGetMessageSchema,
  outfitSelectMessageSchema,
} from "./outfit";
import {
  dailyClaimMessageSchema,
  dailyHistoryGetMessageSchema,
  dailyStateGetMessageSchema,
} from "./dailyRewards";
import { podiumSetMessageSchema } from "./podium";
import {
  questLineGetMessageSchema,
  questLogGetMessageSchema,
} from "./questLog";
import { rewardCollectMessageSchema } from "./rewardChest";
import { reportPlayerMessageSchema } from "./moderation";
import {
  bugReportMessageSchema,
  characterProfileGetMessageSchema,
  profileSelectTitleMessageSchema,
} from "./profile";
import { preyActionMessageSchema } from "./prey";
import {
  setHuntingBotEnabledMessageSchema,
  updateHuntingBotRouteMessageSchema,
} from "./huntingBot";
import { taskHuntingActionMessageSchema } from "./huntingTasks";
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
  partyFinderAdvertiseMessageSchema,
  partyFinderListMessageSchema,
  partyResetAnalyzerMessageSchema,
  partyRevokeInviteMessageSchema,
  partySetAnalyzerPriceModeMessageSchema,
  partySetSharedExpMessageSchema,
} from "./party";
import { shopBuyMessageSchema, shopSellMessageSchema } from "./shop";
import {
  storeCategoryMessageSchema,
  storeDescriptionMessageSchema,
  storeHistoryMessageSchema,
  storeOpenMessageSchema,
  storePurchaseMessageSchema,
} from "./store";
import {
  tradeAcceptMessageSchema,
  tradeCancelMessageSchema,
  tradeRequestMessageSchema,
} from "./trade";
import {
  equipmentSlotSchema,
  MAX_CONTAINER_CAPACITY,
  quickLootFilterSchema,
} from "./item";
import { positionSchema } from "./position";
import { viewRangeSchema } from "./viewRange";
import {
  friendRemoveMessageSchema,
  friendRequestMessageSchema,
  friendRespondMessageSchema,
  socialSetSettingsMessageSchema,
  vipAddMessageSchema,
  vipAssignGroupMessageSchema,
  vipEditMessageSchema,
  vipGroupCreateMessageSchema,
  vipGroupDeleteMessageSchema,
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
 * Latency probe. The server echoes the nonce back verbatim in a `pong` from
 * its tick loop, so the round trip includes the intent queue the way every
 * real action does. Fixed-size, covered by the shared message-size and rate
 * caps; expected at most once per second per client.
 */
export const pingMessageSchema = z
  .object({
    type: z.literal("ping"),
    nonce: z.number().int().nonnegative(),
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

/**
 * Follows one server-known creature without attacking it. The follow state
 * itself lives on the server and is re-validated every tick; the client never
 * supplies a path, a step, or a destination. Expected rate: one per click.
 */
export const followCreatureMessageSchema = z
  .object({
    type: z.literal("follow-creature"),
    creatureId: z.string().min(1).max(192),
  })
  .strict();

/** Clears the current follow target without supplying any replacement state. */
export const cancelFollowMessageSchema = z
  .object({
    type: z.literal("cancel-follow"),
  })
  .strict();

/**
 * Replaces the player's "aim at target" spell set. For a direction spell in
 * this set the server derives the cast direction from the live attack target
 * instead of the player's facing, which is the only thing it changes — every
 * requirement, range, and outcome stays server-owned. Expected rate: one per
 * spell-list edit, at most a few per minute.
 */
export const setAimAtTargetSpellsMessageSchema = z
  .object({
    type: z.literal("set-aim-at-target-spells"),
    spellIds: z
      .array(
        z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      )
      .max(AIM_AT_TARGET_SPELL_LIMIT),
  })
  .strict();

/** Resets the session's own combat-analyzer totals; carries no client data. */
export const resetCombatAnalyzerMessageSchema = z
  .object({
    type: z.literal("reset-combat-analyzer"),
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
    /**
     * Name parameter for the spells Canary declares with `hasParams` (summon
     * creature, creature illusion, mentor other). It is looked up against the
     * server's own catalogs and visible players; it never indexes anything
     * directly and is ignored by every other spell.
     */
    parameter: z.string().min(1).max(64).optional(),
  })
  .strict();

/**
 * Opaque client-issued tag echoed back in the resulting `inventory-updated`.
 * Lets the optimistic drag queue distinguish its own confirmation from an
 * unsolicited inventory change (potion, food, decay) that arrives mid-flight.
 * The server never interprets it; it only echoes it.
 */
export const itemIntentNonceSchema = z.string().min(1).max(64);

const ownedItemIntentSchema = z.object({
  itemId: z.string().uuid(),
  revision: z.number().int().positive(),
  nonce: itemIntentNonceSchema.optional(),
});

export const itemContainerDestinationSchema = z
  .object({
    containerId: z.string().uuid(),
    containerRevision: z.number().int().positive(),
    slot: z.number().int().min(0).max(MAX_CONTAINER_CAPACITY - 1),
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

/**
 * Activates one server-stored action button. The server resolves the action,
 * owned item instance, targeting mode, requirements, and outcome in the tick.
 */
export const activateActionBarMessageSchema = z
  .object({
    type: z.literal("activate-action-bar"),
    slotIndex: z.number().int().min(0).max(ACTION_BAR_SLOT_COUNT - 1),
    target: combatTargetSchema.optional(),
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
    nonce: itemIntentNonceSchema.optional(),
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
    nonce: itemIntentNonceSchema.optional(),
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

/**
 * Opens a container nested inside a world container the session already has
 * open (a bag inside a corpse or chest). The id is a reference the server
 * re-resolves: it must still be inside an open view, in reach, and
 * loot-unprotected at execution time. Fixed size, shared rate caps.
 */
export const openWorldContainerMessageSchema = z
  .object({
    type: z.literal("open-world-container"),
    containerId: z.string().uuid(),
    revision: z.number().int().nonnegative().max(2_147_483_647),
  })
  .strict();

/**
 * Sweeps one open world container into the carried inventory. The optional
 * category only narrows what the server takes; the server owns which bucket
 * an item is in, how much fits, and every reach/ownership check. One sweep per
 * intent, bounded by the container's capacity.
 */
export const quickLootMessageSchema = z
  .object({
    type: z.literal("quick-loot"),
    containerId: z.string().uuid(),
    category: quickLootFilterSchema.optional(),
  })
  .strict();

/**
 * Consolidates the partial stacks inside one owned, carried container. Only
 * the container reference comes from the client: which stacks merge, in what
 * order, and how much moves are all derived from live server state at
 * execution time. Fixed size, shared rate caps.
 */
export const stackContainerMessageSchema = z
  .object({
    type: z.literal("stack-container"),
    containerId: z.string().uuid(),
  })
  .strict();

/**
 * Reorders the items inside one owned, carried container into the server's
 * canonical order. Only the container reference comes from the client; the
 * order itself is a server rule. Fixed size, shared rate caps.
 */
export const sortContainerMessageSchema = z
  .object({
    type: z.literal("sort-container"),
    containerId: z.string().uuid(),
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
    destinationSlot: z
      .number()
      .int()
      .min(0)
      .max(MAX_CONTAINER_CAPACITY - 1),
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

/**
 * Writes bounded text onto a writeable map item (blackboards, tombstones).
 * Max size: the 3997-character text plus a 128-character instance id, well
 * inside the shared 4 KiB message cap. Rate: bounded by the 200 ms use
 * exhaust and the shared 30-per-second transport cap. The server re-checks
 * writeability, the item's own maxLength, adjacency, and the claimed
 * revision at execution time.
 */
export const writeMapItemMessageSchema = z
  .object({
    type: z.literal("write-map-item"),
    /** World map-item instance id (its seed key). */
    itemId: z.string().min(1).max(128),
    revision: z.number().int().positive(),
    position: positionSchema,
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

/** Bounded per-character action layout; every referenced id is revalidated. */
export const updateActionBarMessageSchema = z
  .object({
    type: z.literal("update-action-bar"),
    actionBar: actionBarSchema,
  })
  .strict();

/**
 * The action bot is configured on its own, not through the bar: rules carry
 * their own action, so this travels separately and each message stays well
 * inside the transport cap.
 */
export const updateActionBotMessageSchema = z
  .object({
    type: z.literal("update-action-bot"),
    settings: actionBotSettingsSchema,
  })
  .strict();

export const clientMessageSchema = z.discriminatedUnion("type", [
  authMessageSchema,
  listCharactersMessageSchema,
  createCharacterMessageSchema,
  selectCharacterMessageSchema,
  pingMessageSchema,
  moveMessageSchema,
  turnMessageSchema,
  stopMoveMessageSchema,
  autoWalkMessageSchema,
  setViewportMessageSchema,
  useMapMessageSchema,
  lookMessageSchema,
  attackTargetMessageSchema,
  cancelAttackMessageSchema,
  followCreatureMessageSchema,
  cancelFollowMessageSchema,
  setAimAtTargetSpellsMessageSchema,
  resetCombatAnalyzerMessageSchema,
  setFightModeMessageSchema,
  castSpellMessageSchema,
  useRuneMessageSchema,
  usePotionMessageSchema,
  activateActionBarMessageSchema,
  equipItemMessageSchema,
  unequipItemMessageSchema,
  pickupItemMessageSchema,
  dropItemMessageSchema,
  moveMapItemMessageSchema,
  openContainerMessageSchema,
  closeContainerMessageSchema,
  lootItemMessageSchema,
  openWorldContainerMessageSchema,
  quickLootMessageSchema,
  stackContainerMessageSchema,
  sortContainerMessageSchema,
  closeWorldContainerMessageSchema,
  useItemMessageSchema,
  useItemWithMessageSchema,
  splitStackMessageSchema,
  rotateItemMessageSchema,
  moveItemMessageSchema,
  writeItemMessageSchema,
  writeMapItemMessageSchema,
  channelListGetMessageSchema,
  channelOpenMessageSchema,
  channelCloseMessageSchema,
  channelSpeakMessageSchema,
  ignoreAddMessageSchema,
  ignoreRemoveMessageSchema,
  setLanguageMessageSchema,
  updateUiSettingsMessageSchema,
  updateActionBarMessageSchema,
  updateActionBotMessageSchema,
  updateLootFilterMessageSchema,
  lootFilterItemsGetMessageSchema,
  updateHuntingBotRouteMessageSchema,
  setHuntingBotEnabledMessageSchema,
  npcDialogueGreetMessageSchema,
  npcDialogueChoiceMessageSchema,
  bankDepositMessageSchema,
  bankWithdrawMessageSchema,
  bankTransferMessageSchema,
  shopBuyMessageSchema,
  shopSellMessageSchema,
  storeCategoryMessageSchema,
  storeDescriptionMessageSchema,
  storeHistoryMessageSchema,
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
  partyResetAnalyzerMessageSchema,
  partySetAnalyzerPriceModeMessageSchema,
  partyFinderAdvertiseMessageSchema,
  partyFinderListMessageSchema,
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
  guildDepositMessageSchema,
  guildWithdrawMessageSchema,
  houseOpenMessageSchema,
  houseBuyMessageSchema,
  houseBidMessageSchema,
  houseAbandonMessageSchema,
  houseTransferOfferMessageSchema,
  houseTransferRespondMessageSchema,
  houseTransferCancelMessageSchema,
  houseSetAccessMessageSchema,
  houseSetListMessageSchema,
  houseKickMessageSchema,
  houseBrowseMessageSchema,
  vipAddMessageSchema,
  vipRemoveMessageSchema,
  vipEditMessageSchema,
  vipGroupCreateMessageSchema,
  vipGroupDeleteMessageSchema,
  vipAssignGroupMessageSchema,
  friendRequestMessageSchema,
  friendRespondMessageSchema,
  friendRemoveMessageSchema,
  socialSetSettingsMessageSchema,
  characterProfileGetMessageSchema,
  profileSelectTitleMessageSchema,
  bugReportMessageSchema,
  preyActionMessageSchema,
  taskHuntingActionMessageSchema,
  walkToMessageSchema,
  minimapMarkerSetMessageSchema,
  minimapMarkerDeleteMessageSchema,
  outfitGetMessageSchema,
  outfitSelectMessageSchema,
  podiumSetMessageSchema,
  rewardCollectMessageSchema,
  dailyClaimMessageSchema,
  dailyHistoryGetMessageSchema,
  dailyStateGetMessageSchema,
  questLogGetMessageSchema,
  questLineGetMessageSchema,
  highscoresGetMessageSchema,
  bestiaryCreaturesGetMessageSchema,
  bestiaryMonsterGetMessageSchema,
  bosstiaryGetMessageSchema,
  bosstiaryBossGetMessageSchema,
  trackerSetMessageSchema,
  bossSlotsGetMessageSchema,
  bossSlotSetMessageSchema,
  forgeGetMessageSchema,
  forgeFusionMessageSchema,
  forgeTransferMessageSchema,
  forgeConversionMessageSchema,
  forgeHistoryGetMessageSchema,
  imbuementWindowGetMessageSchema,
  imbuementApplyMessageSchema,
  imbuementClearMessageSchema,
  imbuementScrollCreateMessageSchema,
  imbuementScrollApplyMessageSchema,
  proficiencyGetMessageSchema,
  proficiencySelectMessageSchema,
  cyclopediaCharacterGetMessageSchema,
  wikiItemSourcesGetMessageSchema,
  wheelGetMessageSchema,
  wheelSaveMessageSchema,
  gemGetMessageSchema,
  gemActionMessageSchema,
  reportPlayerMessageSchema,
  speakMessageSchema,
  chatTypingMessageSchema,
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
export type PingMessage = z.infer<typeof pingMessageSchema>;
export type TurnMessage = z.infer<typeof turnMessageSchema>;
export type StopMoveMessage = z.infer<typeof stopMoveMessageSchema>;
export type AutoWalkMessage = z.infer<typeof autoWalkMessageSchema>;
export type SetViewportMessage = z.infer<typeof setViewportMessageSchema>;
export type UseMapMessage = z.infer<typeof useMapMessageSchema>;
export type AttackTargetMessage = z.infer<typeof attackTargetMessageSchema>;
export type CancelAttackMessage = z.infer<typeof cancelAttackMessageSchema>;
export type FollowCreatureMessage = z.infer<
  typeof followCreatureMessageSchema
>;
export type CancelFollowMessage = z.infer<typeof cancelFollowMessageSchema>;
export type SetAimAtTargetSpellsMessage = z.infer<
  typeof setAimAtTargetSpellsMessageSchema
>;
export type ResetCombatAnalyzerMessage = z.infer<
  typeof resetCombatAnalyzerMessageSchema
>;
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
export type OpenWorldContainerMessage = z.infer<
  typeof openWorldContainerMessageSchema
>;
export type QuickLootMessage = z.infer<typeof quickLootMessageSchema>;
export type StackContainerMessage = z.infer<typeof stackContainerMessageSchema>;
export type SortContainerMessage = z.infer<typeof sortContainerMessageSchema>;
export type CloseWorldContainerMessage = z.infer<
  typeof closeWorldContainerMessageSchema
>;
export type UseItemMessage = z.infer<typeof useItemMessageSchema>;
export type UseItemWithMessage = z.infer<typeof useItemWithMessageSchema>;
export type SplitStackMessage = z.infer<typeof splitStackMessageSchema>;
export type RotateItemMessage = z.infer<typeof rotateItemMessageSchema>;
export type MoveItemMessage = z.infer<typeof moveItemMessageSchema>;
export type WriteItemMessage = z.infer<typeof writeItemMessageSchema>;
export type WriteMapItemMessage = z.infer<typeof writeMapItemMessageSchema>;
export type PodiumSetMessage = z.infer<typeof podiumSetMessageSchema>;
export type RewardCollectMessage = z.infer<typeof rewardCollectMessageSchema>;
export type DailyClaimMessage = z.infer<typeof dailyClaimMessageSchema>;
export type DailyHistoryGetMessage = z.infer<
  typeof dailyHistoryGetMessageSchema
>;
export type DailyStateGetMessage = z.infer<typeof dailyStateGetMessageSchema>;
export type QuestLogGetMessage = z.infer<typeof questLogGetMessageSchema>;
export type QuestLineGetMessage = z.infer<typeof questLineGetMessageSchema>;
export type SetLanguageMessage = z.infer<typeof setLanguageMessageSchema>;
export type UpdateUiSettingsMessage = z.infer<
  typeof updateUiSettingsMessageSchema
>;
export type UpdateActionBarMessage = z.infer<
  typeof updateActionBarMessageSchema
>;
export type UpdateActionBotMessage = z.infer<
  typeof updateActionBotMessageSchema
>;
export type ActivateActionBarMessage = z.infer<
  typeof activateActionBarMessageSchema
>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;
