import { z } from "zod";
import {
  bankActionFailedMessageSchema,
  bankOpenedMessageSchema,
  bankUpdatedMessageSchema,
} from "./bank";
import {
  characterCreationOptionsSchema,
  characterSummarySchema,
  ownCharacterStateSchema,
} from "./character";
import {
  chatRejectedMessageSchema,
  creatureSpokeMessageSchema,
  privateChatDeliveredMessageSchema,
} from "./chat";
import {
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
import { gmResponseMessageSchema } from "./gm";
import {
  highscoresActionFailedMessageSchema,
  highscoresStateMessageSchema,
} from "./highscores";
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
  partyChatDeliveredMessageSchema,
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
  tradeActionFailedMessageSchema,
  tradeClosedMessageSchema,
  tradeStateMessageSchema,
} from "./trade";
import {
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
});

export const languageUpdatedMessageSchema = z.object({
  type: z.literal("language-updated"),
  language: languageSchema,
});

export const uiSettingsUpdatedMessageSchema = z.object({
  type: z.literal("ui-settings-updated"),
  settings: uiSettingsSchema,
});

export const characterListMessageSchema = z.object({
  type: z.literal("character-list"),
  characters: z.array(characterSummarySchema),
  creationOptions: characterCreationOptionsSchema,
});

export const welcomeMessageSchema = z.object({
  type: z.literal("welcome"),
  playerId: z.string(),
  character: ownCharacterStateSchema,
  map: mapInfoSchema,
  creatures: z.array(creatureStateSchema),
  inventory: inventoryStateSchema,
  fightState: fightStateSchema,
  spells: z.array(spellCatalogEntrySchema).max(256),
  uiSettings: uiSettingsSchema,
});

export const inventoryUpdatedMessageSchema = z.object({
  type: z.literal("inventory-updated"),
  inventory: inventoryStateSchema,
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
});

export const progressionUpdatedMessageSchema = z.object({
  type: z.literal("progression-updated"),
  playerId: z.string(),
  progression: ownProgressionStateSchema,
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

export const fightStateMessageSchema = z.object({
  type: z.literal("fight-state"),
  fightState: fightStateSchema,
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
  "character-operation-pending",
  "invalid-message",
  "join-required",
  "language-update-failed",
  "language-update-pending",
  "ui-settings-update-failed",
  "ui-settings-update-pending",
  "combat-action-failed",
  "item-action-failed",
  "loot-protected",
  "player-full",
  "logged-in-elsewhere",
  "kicked",
  "rate-limited",
  "world-full",
]);

export const errorMessageSchema = z.object({
  type: z.literal("error"),
  code: serverErrorCodeSchema,
});

export const serverMessageSchema = z.discriminatedUnion("type", [
  authOkMessageSchema,
  languageUpdatedMessageSchema,
  uiSettingsUpdatedMessageSchema,
  characterListMessageSchema,
  welcomeMessageSchema,
  inventoryUpdatedMessageSchema,
  itemTextMessageSchema,
  progressionUpdatedMessageSchema,
  creatureJoinedMessageSchema,
  creatureLeftMessageSchema,
  creatureMovedMessageSchema,
  positionCorrectionMessageSchema,
  attackTargetChangedMessageSchema,
  fightStateMessageSchema,
  creatureHealthMessageSchema,
  creatureStateChangedMessageSchema,
  combatTextMessageSchema,
  magicEffectMessageSchema,
  distanceMissileMessageSchema,
  combatLogMessageSchema,
  tileStatesMessageSchema,
  worldContainerStateMessageSchema,
  worldContainerClosedMessageSchema,
  npcDialogueMessageSchema,
  npcDialogueClosedMessageSchema,
  bankOpenedMessageSchema,
  bankUpdatedMessageSchema,
  bankActionFailedMessageSchema,
  shopOpenedMessageSchema,
  shopTransactedMessageSchema,
  shopActionFailedMessageSchema,
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
  highscoresStateMessageSchema,
  highscoresActionFailedMessageSchema,
  reportReceivedMessageSchema,
  reportActionFailedMessageSchema,
  creatureSpokeMessageSchema,
  privateChatDeliveredMessageSchema,
  chatRejectedMessageSchema,
  gmResponseMessageSchema,
  errorMessageSchema,
]);

export type MapInfo = z.infer<typeof mapInfoSchema>;
export type MapItemState = z.infer<typeof mapItemStateSchema>;
export type TileState = z.infer<typeof tileStateSchema>;
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
