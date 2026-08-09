import { z } from "zod";
import {
  accountTierSchema,
  premiumDaysRemainingSchema,
} from "./account";
import {
  ACTION_BAR_SLOT_COUNT,
  actionBarSchema,
  actionBotSettingsSchema,
} from "./actionBar";
import {
  BANK_LIMITS,
  bankActionFailedMessageSchema,
  bankOpenedMessageSchema,
  bankUpdatedMessageSchema,
} from "./bank";
import {
  characterCreationOptionsSchema,
  characterSummarySchema,
  characterVocationSchema,
  ownCharacterStateSchema,
} from "./character";
import {
  lootFilterItemsMessageSchema,
  lootFilterSchema,
  lootFilterUpdatedMessageSchema,
} from "./lootFilter";
import {
  huntingBotRouteMessageSchema,
  huntingBotRouteSchema,
  huntingBotStatusMessageSchema,
} from "./huntingBot";
import {
  channelClosedMessageSchema,
  channelListMessageSchema,
  channelMessageSchema,
  chatRejectedMessageSchema,
  creatureSpokeMessageSchema,
  ignoreListMessageSchema,
  chatTypingStateMessageSchema,
  privateChatDeliveredMessageSchema,
  serverNoticeMessageSchema,
} from "./chat";
import {
  AIM_AT_TARGET_SPELL_LIMIT,
  combatAnalyzerStateSchema,
  damageTypeSchema,
  fightStateSchema,
  hitBlockSchema,
  spellCatalogEntrySchema,
} from "./combat";
import { creatureStateSchema } from "./creature";
import {
  depotActionFailedMessageSchema,
  depotStateMessageSchema,
  mailboxOpenedMessageSchema,
  mailActionFailedMessageSchema,
  mailSentMessageSchema,
} from "./depot";
import { DIRECTIONS } from "./direction";
import {
  portableSellerCooldownMessageSchema,
  portableSellerTriggeredMessageSchema,
} from "./portableSeller";
import { gmResponseMessageSchema } from "./gm";
import {
  bestiaryActionFailedMessageSchema,
  bestiaryCreaturesStateMessageSchema,
  bestiaryEntryChangedMessageSchema,
  bestiaryMonsterStateMessageSchema,
  bosstiaryBossStateMessageSchema,
  bosstiaryStateMessageSchema,
  trackerStateMessageSchema,
  wikiItemSourcesStateMessageSchema,
} from "./bestiary";
import { boostedStateMessageSchema } from "./boosted";
import {
  bossSlotFailedMessageSchema,
  bossSlotsStateMessageSchema,
} from "./bosstiarySlots";
import {
  forgeActionFailedMessageSchema,
  forgeHistoryStateMessageSchema,
  forgeResultMessageSchema,
  forgeStateMessageSchema,
} from "./forge";
import {
  imbuementActionFailedMessageSchema,
  imbuementWindowStateMessageSchema,
} from "./imbuements";
import {
  animusStateMessageSchema,
  proficiencyActionFailedMessageSchema,
  proficiencyStateMessageSchema,
} from "./proficiency";
import {
  cyclopediaActionFailedMessageSchema,
  cyclopediaCombatStateMessageSchema,
  cyclopediaDeathsStateMessageSchema,
  cyclopediaItemSummaryStateMessageSchema,
  cyclopediaPvpKillsStateMessageSchema,
} from "./cyclopedia";
import {
  highscoresActionFailedMessageSchema,
  highscoresStateMessageSchema,
} from "./highscores";
import {
  wheelActionFailedMessageSchema,
  wheelStateMessageSchema,
} from "./wheel";
import {
  gemActionFailedMessageSchema,
  gemStateMessageSchema,
} from "./gemAtelierMessages";
import {
  guildActionFailedMessageSchema,
  guildChatDeliveredMessageSchema,
  guildEventMessageSchema,
  guildInvitationMessageSchema,
  guildStateMessageSchema,
} from "./guild";
import {
  houseActionFailedMessageSchema,
  houseEventMessageSchema,
  houseListMessageSchema,
  houseStateMessageSchema,
  houseTransferIncomingMessageSchema,
} from "./house";
import { languageSchema } from "./language";
import { lookTextMessageSchema } from "./look";
import { uiSettingsSchema } from "./uiSettings";
import { containerStateSchema, inventoryStateSchema } from "./item";
import {
  reportActionFailedMessageSchema,
  reportReceivedMessageSchema,
} from "./moderation";
import {
  npcDialogueClosedMessageSchema,
  npcDialogueMessageSchema,
} from "./npc";
import {
  marketActionFailedMessageSchema,
  marketOffersMessageSchema,
  marketOpenedMessageSchema,
  marketOwnHistoryStateMessageSchema,
  marketOwnOffersStateMessageSchema,
  marketTransactedMessageSchema,
} from "./market";
import {
  partyActionFailedMessageSchema,
  partyAnalyzerMessageSchema,
  partyChatDeliveredMessageSchema,
  partyFinderListingMessageSchema,
  partyInvitationMessageSchema,
  partyInvitationRevokedMessageSchema,
  partyStateMessageSchema,
} from "./party";
import { positionSchema } from "./position";
import { ownProgressionStateSchema } from "./progression";
import {
  shopActionFailedMessageSchema,
  shopOpenedMessageSchema,
  shopTransactedMessageSchema,
} from "./shop";
import {
  storeActionFailedMessageSchema,
  storeHistoryStateMessageSchema,
  storeOffersMessageSchema,
  storeDescriptionStateMessageSchema,
  storePurchaseCompletedMessageSchema,
  storeStateMessageSchema,
} from "./store";
import {
  tradeActionFailedMessageSchema,
  tradeClosedMessageSchema,
  tradeStateMessageSchema,
} from "./trade";
import { minimapMarkersMessageSchema } from "./minimap";
import {
  outfitActionFailedMessageSchema,
  outfitStateMessageSchema,
} from "./outfit";
import {
  podiumActionFailedMessageSchema,
  podiumDisplaySchema,
  podiumWindowMessageSchema,
} from "./podium";
import {
  rewardActionFailedMessageSchema,
  rewardChestStateMessageSchema,
} from "./rewardChest";
import {
  dailyActionFailedMessageSchema,
  dailyRewardHistoryMessageSchema,
  dailyRewardsStateMessageSchema,
} from "./dailyRewards";
import {
  questLineMessageSchema,
  questLogFailedMessageSchema,
  questLogMessageSchema,
} from "./questLog";
import {
  achievementGrantedMessageSchema,
  characterProfileMessageSchema,
  profileActionFailedMessageSchema,
  profileStateMessageSchema,
} from "./profile";
import {
  preyActionFailedMessageSchema,
  preyStateMessageSchema,
} from "./prey";
import {
  taskHuntingActionFailedMessageSchema,
  taskHuntingStateMessageSchema,
} from "./huntingTasks";
import {
  friendStateMessageSchema,
  vipActionFailedMessageSchema,
  vipStateMessageSchema,
  vipStatusChangedMessageSchema,
} from "./vip";

/**
 * Static terrain is public data served over HTTP from
 * /assets/map/<name>/; the socket only carries dynamic, view-filtered state.
 */
export const mapInfoSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
});

export const authOkMessageSchema = z.object({
  type: z.literal("auth-ok"),
  language: languageSchema,
  accountTier: accountTierSchema,
  premiumDaysRemaining: premiumDaysRemainingSchema,
});

export const languageUpdatedMessageSchema = z.object({
  type: z.literal("language-updated"),
  language: languageSchema,
});

export const uiSettingsUpdatedMessageSchema = z.object({
  type: z.literal("ui-settings-updated"),
  settings: uiSettingsSchema,
});

export const actionBarUpdatedMessageSchema = z.object({
  type: z.literal("action-bar-updated"),
  actionBar: actionBarSchema,
});

export const actionBotUpdatedMessageSchema = z.object({
  type: z.literal("action-bot-updated"),
  settings: actionBotSettingsSchema,
});

export const actionBarActivationResultMessageSchema = z
  .object({
    type: z.literal("action-bar-activation-result"),
    slotIndex: z.number().int().min(0).max(ACTION_BAR_SLOT_COUNT - 1),
    accepted: z.boolean(),
  })
  .strict();

export const characterListMessageSchema = z.object({
  type: z.literal("character-list"),
  accountTier: accountTierSchema,
  premiumDaysRemaining: premiumDaysRemainingSchema,
  characters: z.array(characterSummarySchema),
  creationOptions: characterCreationOptionsSchema,
});

export const welcomeMessageSchema = z.object({
  type: z.literal("welcome"),
  playerId: z.string(),
  accountTier: accountTierSchema,
  premiumDaysRemaining: premiumDaysRemainingSchema,
  mantusCoins: z.number().int().min(0).max(1_000_000_000_000),
  /** Own bank balance, so the wallet counter is right before any bank visit. */
  bankBalance: z.number().int().min(0).max(BANK_LIMITS.maxBalance),
  character: ownCharacterStateSchema,
  map: mapInfoSchema,
  creatures: z.array(creatureStateSchema),
  inventory: inventoryStateSchema,
  fightState: fightStateSchema,
  spells: z.array(spellCatalogEntrySchema).max(256),
  uiSettings: uiSettingsSchema,
  actionBar: actionBarSchema,
  actionBotSettings: actionBotSettingsSchema,
  lootFilter: lootFilterSchema,
  huntingBotRoute: huntingBotRouteSchema,
  aimAtTargetSpellIds: z
    .array(z.string().min(1).max(64))
    .max(AIM_AT_TARGET_SPELL_LIMIT),
});

export const inventoryUpdatedMessageSchema = z.object({
  type: z.literal("inventory-updated"),
  inventory: inventoryStateSchema,
  /**
   * Echo of the client nonce from the item intent that produced this update.
   * Present only for optimistic drag ops; absent on server-initiated changes
   * (potion, food, decay), which the client applies without advancing its
   * drag queue.
   */
  nonce: z.string().min(1).max(64).optional(),
});

export const itemTextMessageSchema = z.object({
  type: z.literal("item-text"),
  /** Carried item uuid or world map-item instance id (seed key). */
  itemId: z.string().min(1).max(128),
  revision: z.number().int().positive(),
  name: z.string().min(1).max(120),
  text: z.string().max(3_997),
  writeable: z.boolean(),
  maxLength: z.number().int().min(0).max(3_997),
  /** Set for map items, so a write is sent as `write-map-item`. */
  position: positionSchema.optional(),
});

export const progressionUpdatedMessageSchema = z.object({
  type: z.literal("progression-updated"),
  playerId: z.string(),
  progression: ownProgressionStateSchema,
});

export const vocationUpdatedMessageSchema = z.object({
  type: z.literal("vocation-updated"),
  playerId: z.string(),
  vocation: characterVocationSchema,
  spells: z.array(spellCatalogEntrySchema).max(256),
});

export const creatureJoinedMessageSchema = z.object({
  type: z.literal("creature-joined"),
  creature: creatureStateSchema,
});

export const creatureLeftMessageSchema = z.object({
  type: z.literal("creature-left"),
  creatureId: z.string(),
});

export const creatureMovedMessageSchema = z.object({
  type: z.literal("creature-moved"),
  creatureId: z.string(),
  from: positionSchema,
  position: positionSchema,
  direction: z.enum(DIRECTIONS),
  positionRevision: z.number().int().nonnegative(),
  durationMs: z.number().int().min(0).max(60_000),
});

export const positionCorrectionMessageSchema = z.object({
  type: z.literal("position-correction"),
  playerId: z.string(),
  position: positionSchema,
  direction: z.enum(DIRECTIONS),
  positionRevision: z.number().int().nonnegative(),
  retryAfterMs: z.number().int().min(0).max(60_000),
  reason: z.enum([
    "cooldown",
    "blocked",
    "occupied",
    "invalid-transition",
    "stale-revision",
  ]),
});

export const attackTargetChangedMessageSchema = z.object({
  type: z.literal("attack-target-changed"),
  creatureId: z.string().min(1).max(192).nullable(),
});

export const followTargetChangedMessageSchema = z.object({
  type: z.literal("follow-target-changed"),
  creatureId: z.string().min(1).max(192).nullable(),
});

export const fightStateMessageSchema = z.object({
  type: z.literal("fight-state"),
  fightState: fightStateSchema,
});

/** Echoes the server-stored aim-at-target set after an accepted update. */
export const aimAtTargetSpellsMessageSchema = z.object({
  type: z.literal("aim-at-target-spells"),
  spellIds: z.array(z.string().min(1).max(64)).max(AIM_AT_TARGET_SPELL_LIMIT),
});

export const combatAnalyzerMessageSchema = z.object({
  type: z.literal("combat-analyzer"),
  analyzer: combatAnalyzerStateSchema,
});

export const creatureHealthMessageSchema = z.object({
  type: z.literal("creature-health"),
  creatureId: z.string().min(1).max(192),
  healthPercent: z.number().int().min(0).max(100).nullable(),
});

export const creatureStateChangedMessageSchema = z.object({
  type: z.literal("creature-state-changed"),
  creature: creatureStateSchema,
});

export const combatTextMessageSchema = z.object({
  type: z.literal("combat-text"),
  position: positionSchema,
  value: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  damageType: damageTypeSchema,
  block: hitBlockSchema,
});

/**
 * Fixed-shape outbound payload under 128 bytes at its schema maxima. The
 * server emits at most one per successful recipient award per monster death.
 */
export const experienceTextMessageSchema = z
  .object({
    type: z.literal("experience-text"),
    position: positionSchema,
    value: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const magicEffectMessageSchema = z.object({
  type: z.literal("magic-effect"),
  position: positionSchema,
  effectId: z.number().int().positive().max(65_535),
});

export const distanceMissileMessageSchema = z.object({
  type: z.literal("distance-missile"),
  from: positionSchema,
  to: positionSchema,
  missileId: z.number().int().positive().max(255),
  durationMs: z.number().int().positive().max(5_000),
});

export const combatLogMessageSchema = z.object({
  type: z.literal("combat-log"),
  kind: z.enum([
    "damage",
    "healing",
    "experience",
    "death",
    "miss",
    "condition",
  ]),
  text: z.string().min(1).max(160),
});

export const mapItemStateSchema = z.object({
  instanceId: z.string().min(1).max(128),
  itemId: z.number().int().positive().max(65_535),
  stackIndex: z.number().int().min(0).max(255),
  revision: z.number().int().positive(),
  count: z.number().int().positive().max(100),
  /** Unit weight in hundredths of oz, for client capacity pre-checks. */
  weight: z.number().int().nonnegative().optional(),
  /** Podium show-off state, server-derived from the item's attributes. */
  display: podiumDisplaySchema.optional(),
});

export const tileStateSchema = z.object({
  position: positionSchema,
  revision: z.number().int().nonnegative(),
  items: z.array(mapItemStateSchema).max(16),
});

export const tileStatesMessageSchema = z.object({
  type: z.literal("tile-states"),
  visible: z.array(tileStateSchema).max(1_024),
  hidden: z.array(positionSchema).max(1_024),
});

/**
 * One open world container (corpse) view. Sent on open and re-sent whenever
 * the contents change; carries only what the viewing player may see.
 */
export const worldContainerStateMessageSchema = z.object({
  type: z.literal("world-container-state"),
  position: positionSchema,
  state: containerStateSchema,
});

export const worldContainerClosedMessageSchema = z.object({
  type: z.literal("world-container-closed"),
  containerId: z.string().uuid(),
});

export const serverErrorCodeSchema = z.enum([
  "account-banned",
  "action-bar-invalid",
  "action-bar-update-failed",
  "action-bar-update-pending",
  "action-bot-invalid",
  "action-bot-update-failed",
  "action-bot-update-pending",
  "loot-filter-invalid",
  "loot-filter-update-failed",
  "loot-filter-update-pending",
  "hunting-bot-invalid",
  "hunting-bot-out-of-range",
  "hunting-bot-wrong-floor",
  "hunting-bot-update-failed",
  "hunting-bot-update-pending",
  "already-authenticated",
  "already-joined",
  "auth-failed",
  "auth-required",
  "auth-timeout",
  "character-limit-reached",
  "character-list-failed",
  "character-load-failed",
  "character-name-invalid",
  "character-name-taken",
  "character-not-found",
  "character-namelocked",
  "character-operation-pending",
  "invalid-message",
  "join-required",
  "language-update-failed",
  "language-update-pending",
  "fight-mode-update-failed",
  "aim-at-target-update-failed",
  "aim-at-target-update-pending",
  "ui-settings-update-failed",
  "ui-settings-update-pending",
  "combat-action-failed",
  "spell-busy",
  "spell-exhausted",
  "spell-level-restricted",
  "spell-line-of-sight",
  "spell-magic-level-restricted",
  "spell-mana-insufficient",
  "spell-muted",
  "spell-not-learned",
  "spell-not-possible",
  "spell-out-of-range",
  "spell-protection-zone",
  "spell-soul-insufficient",
  "spell-target-invalid",
  "spell-target-protected",
  "spell-unavailable",
  "spell-vocation-restricted",
  "spell-weapon-required",
  "spell-summon-limit",
  "spell-parameter-invalid",
  "item-action-failed",
  "item-exhausted",
  "portable-seller-empty",
  "loot-protected",
  "player-full",
  "potion-exhausted",
  "potion-level-restricted",
  "potion-vocation-restricted",
  "logged-in-elsewhere",
  "kicked",
  "rate-limited",
  "world-full",
]);

export const errorMessageSchema = z.object({
  type: z.literal("error"),
  code: serverErrorCodeSchema,
});

/** Echo of a client `ping`; the nonce comes back untouched. */
export const pongMessageSchema = z.object({
  type: z.literal("pong"),
  nonce: z.number().int().nonnegative(),
});

export const serverMessageSchema = z.discriminatedUnion("type", [
  authOkMessageSchema,
  languageUpdatedMessageSchema,
  uiSettingsUpdatedMessageSchema,
  actionBarUpdatedMessageSchema,
  actionBotUpdatedMessageSchema,
  lootFilterUpdatedMessageSchema,
  lootFilterItemsMessageSchema,
  huntingBotRouteMessageSchema,
  huntingBotStatusMessageSchema,
  actionBarActivationResultMessageSchema,
  characterListMessageSchema,
  welcomeMessageSchema,
  inventoryUpdatedMessageSchema,
  itemTextMessageSchema,
  lookTextMessageSchema,
  progressionUpdatedMessageSchema,
  vocationUpdatedMessageSchema,
  creatureJoinedMessageSchema,
  creatureLeftMessageSchema,
  creatureMovedMessageSchema,
  positionCorrectionMessageSchema,
  attackTargetChangedMessageSchema,
  followTargetChangedMessageSchema,
  fightStateMessageSchema,
  aimAtTargetSpellsMessageSchema,
  combatAnalyzerMessageSchema,
  creatureHealthMessageSchema,
  creatureStateChangedMessageSchema,
  combatTextMessageSchema,
  experienceTextMessageSchema,
  magicEffectMessageSchema,
  distanceMissileMessageSchema,
  combatLogMessageSchema,
  tileStatesMessageSchema,
  worldContainerStateMessageSchema,
  worldContainerClosedMessageSchema,
  portableSellerTriggeredMessageSchema,
  portableSellerCooldownMessageSchema,
  npcDialogueMessageSchema,
  npcDialogueClosedMessageSchema,
  bankOpenedMessageSchema,
  bankUpdatedMessageSchema,
  bankActionFailedMessageSchema,
  shopOpenedMessageSchema,
  shopTransactedMessageSchema,
  shopActionFailedMessageSchema,
  storeStateMessageSchema,
  storeOffersMessageSchema,
  storeDescriptionStateMessageSchema,
  storeHistoryStateMessageSchema,
  storePurchaseCompletedMessageSchema,
  storeActionFailedMessageSchema,
  depotStateMessageSchema,
  depotActionFailedMessageSchema,
  mailboxOpenedMessageSchema,
  mailSentMessageSchema,
  mailActionFailedMessageSchema,
  marketOpenedMessageSchema,
  marketOffersMessageSchema,
  marketOwnOffersStateMessageSchema,
  marketOwnHistoryStateMessageSchema,
  marketTransactedMessageSchema,
  marketActionFailedMessageSchema,
  tradeStateMessageSchema,
  tradeClosedMessageSchema,
  tradeActionFailedMessageSchema,
  partyStateMessageSchema,
  partyInvitationMessageSchema,
  partyInvitationRevokedMessageSchema,
  partyChatDeliveredMessageSchema,
  partyAnalyzerMessageSchema,
  partyFinderListingMessageSchema,
  partyActionFailedMessageSchema,
  guildStateMessageSchema,
  guildInvitationMessageSchema,
  guildChatDeliveredMessageSchema,
  guildEventMessageSchema,
  guildActionFailedMessageSchema,
  houseStateMessageSchema,
  houseListMessageSchema,
  houseTransferIncomingMessageSchema,
  houseEventMessageSchema,
  houseActionFailedMessageSchema,
  vipStateMessageSchema,
  vipStatusChangedMessageSchema,
  vipActionFailedMessageSchema,
  friendStateMessageSchema,
  profileStateMessageSchema,
  characterProfileMessageSchema,
  achievementGrantedMessageSchema,
  profileActionFailedMessageSchema,
  preyStateMessageSchema,
  preyActionFailedMessageSchema,
  taskHuntingStateMessageSchema,
  taskHuntingActionFailedMessageSchema,
  minimapMarkersMessageSchema,
  outfitStateMessageSchema,
  outfitActionFailedMessageSchema,
  podiumWindowMessageSchema,
  podiumActionFailedMessageSchema,
  rewardChestStateMessageSchema,
  rewardActionFailedMessageSchema,
  dailyRewardsStateMessageSchema,
  dailyRewardHistoryMessageSchema,
  dailyActionFailedMessageSchema,
  questLogMessageSchema,
  questLineMessageSchema,
  questLogFailedMessageSchema,
  highscoresStateMessageSchema,
  highscoresActionFailedMessageSchema,
  bestiaryCreaturesStateMessageSchema,
  bestiaryMonsterStateMessageSchema,
  bosstiaryStateMessageSchema,
  bosstiaryBossStateMessageSchema,
  wikiItemSourcesStateMessageSchema,
  bestiaryEntryChangedMessageSchema,
  bestiaryActionFailedMessageSchema,
  trackerStateMessageSchema,
  boostedStateMessageSchema,
  bossSlotsStateMessageSchema,
  bossSlotFailedMessageSchema,
  forgeStateMessageSchema,
  forgeResultMessageSchema,
  forgeHistoryStateMessageSchema,
  forgeActionFailedMessageSchema,
  imbuementWindowStateMessageSchema,
  imbuementActionFailedMessageSchema,
  proficiencyStateMessageSchema,
  proficiencyActionFailedMessageSchema,
  animusStateMessageSchema,
  cyclopediaCombatStateMessageSchema,
  cyclopediaDeathsStateMessageSchema,
  cyclopediaPvpKillsStateMessageSchema,
  cyclopediaItemSummaryStateMessageSchema,
  cyclopediaActionFailedMessageSchema,
  wheelStateMessageSchema,
  wheelActionFailedMessageSchema,
  gemStateMessageSchema,
  gemActionFailedMessageSchema,
  reportReceivedMessageSchema,
  reportActionFailedMessageSchema,
  creatureSpokeMessageSchema,
  chatTypingStateMessageSchema,
  privateChatDeliveredMessageSchema,
  chatRejectedMessageSchema,
  channelListMessageSchema,
  channelMessageSchema,
  channelClosedMessageSchema,
  ignoreListMessageSchema,
  serverNoticeMessageSchema,
  gmResponseMessageSchema,
  errorMessageSchema,
  pongMessageSchema,
]);

export type MapInfo = z.infer<typeof mapInfoSchema>;
export type PongMessage = z.infer<typeof pongMessageSchema>;
export type MapItemState = z.infer<typeof mapItemStateSchema>;
export type TileState = z.infer<typeof tileStateSchema>;
export type PodiumWindowMessage = z.infer<typeof podiumWindowMessageSchema>;
export type PodiumActionFailedMessage = z.infer<
  typeof podiumActionFailedMessageSchema
>;
export type RewardChestStateMessage = z.infer<
  typeof rewardChestStateMessageSchema
>;
export type RewardActionFailedMessage = z.infer<
  typeof rewardActionFailedMessageSchema
>;
export type DailyRewardsStateMessage = z.infer<
  typeof dailyRewardsStateMessageSchema
>;
export type DailyRewardHistoryMessage = z.infer<
  typeof dailyRewardHistoryMessageSchema
>;
export type DailyActionFailedMessage = z.infer<
  typeof dailyActionFailedMessageSchema
>;
export type QuestLogMessage = z.infer<typeof questLogMessageSchema>;
export type QuestLineMessage = z.infer<typeof questLineMessageSchema>;
export type QuestLogFailedMessage = z.infer<
  typeof questLogFailedMessageSchema
>;
export type CharacterListMessage = z.infer<typeof characterListMessageSchema>;
export type WelcomeMessage = z.infer<typeof welcomeMessageSchema>;
export type WorldContainerStateMessage = z.infer<
  typeof worldContainerStateMessageSchema
>;
export type WorldContainerClosedMessage = z.infer<
  typeof worldContainerClosedMessageSchema
>;
export type ServerErrorCode = z.infer<typeof serverErrorCodeSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
