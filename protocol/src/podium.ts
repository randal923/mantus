import { z } from "zod";
import { creatureOutfitSchema } from "./creature";
import { mountEntitlementSchema, outfitEntitlementSchema } from "./outfit";
import { positionSchema } from "./position";

// Feature 86 — podium/show-off objects. Behavior transcribed from pinned
// Canary game.cpp:5212-5340 (playerSetShowOffSocket), game.cpp:11247-11356
// (playerSetMonsterPodium) and protocolgame.cpp:11279-11369: renown podiums
// display an owned outfit+mount, vigour displays an unlocked bosstiary boss
// (level 2+), tenacity displays a completed bestiary race.

export const PODIUM_LIMITS = {
  /** Unlocked-race list payload bound (full bestiary is ~500 races). */
  maxRaces: 2_048,
  /** Mirrors OUTFIT_LIMITS: the picker lists the same entitlements. */
  maxOutfitEntries: 200,
  maxMountEntries: 200,
  /** One podium edit per 300 ms per session. */
  editCooldownMs: 300,
} as const;

export const PODIUM_FAMILIES = ["renown", "vigour", "tenacity"] as const;
export const podiumFamilySchema = z.enum(PODIUM_FAMILIES);
export type PodiumFamily = z.infer<typeof podiumFamilySchema>;

/** South-facing default like Canary's LookDirection fallback (2). */
export const podiumDirectionSchema = z.number().int().min(0).max(3);

const lookTypeValueSchema = z.number().int().min(0).max(65_535);
const lookColorSchema = z.number().int().min(0).max(132);
const addonsSchema = z.number().int().min(0).max(3);
const raceIdValueSchema = z.number().int().min(0).max(65_535);

/**
 * Server-authored display payload projected on the podium's tile for every
 * viewer that can see it; never accepted from a client.
 */
export const podiumDisplaySchema = z
  .object({
    lookType: lookTypeValueSchema,
    lookTypeEx: lookTypeValueSchema,
    head: lookColorSchema,
    body: lookColorSchema,
    legs: lookColorSchema,
    feet: lookColorSchema,
    addons: addonsSchema,
    mountLookType: lookTypeValueSchema,
    direction: podiumDirectionSchema,
  })
  .strict();
export type PodiumDisplay = z.infer<typeof podiumDisplaySchema>;

const podiumSelectionShape = {
  podiumVisible: z.boolean(),
  direction: podiumDirectionSchema,
  /** Renown outfit selection; 0 clears the outfit. */
  lookType: lookTypeValueSchema,
  head: lookColorSchema,
  body: lookColorSchema,
  legs: lookColorSchema,
  feet: lookColorSchema,
  addons: addonsSchema,
  /** Renown mount sprite; 0 = no mount. */
  mountLookType: lookTypeValueSchema,
  /** Vigour/tenacity race selection; 0 clears the monster. */
  raceId: raceIdValueSchema,
  monsterVisible: z.boolean(),
} as const;

/**
 * One podium edit; the server re-resolves the item, re-checks reach, house
 * access, revision and every entitlement at execution time. Race outfits are
 * always copied server-side from the monster type, never from this message.
 */
export const podiumSetMessageSchema = z
  .object({
    type: z.literal("podium-set"),
    /** World map-item instance id (its seed key). */
    itemId: z.string().min(1).max(128),
    revision: z.number().int().positive(),
    position: positionSchema,
    ...podiumSelectionShape,
  })
  .strict();

export const podiumCurrentSchema = z.object(podiumSelectionShape).strict();
export type PodiumCurrent = z.infer<typeof podiumCurrentSchema>;

export const podiumRaceEntrySchema = z
  .object({
    raceId: z.number().int().min(1).max(65_535),
    name: z.string().min(1).max(100),
    /** Preview sprite, server-copied from the monster type. */
    outfit: creatureOutfitSchema,
  })
  .strict();
export type PodiumRaceEntry = z.infer<typeof podiumRaceEntrySchema>;

/** Sent only to the session that used the podium; lists its own unlocks. */
export const podiumWindowMessageSchema = z
  .object({
    type: z.literal("podium-window"),
    itemId: z.string().min(1).max(128),
    revision: z.number().int().positive(),
    position: positionSchema,
    family: podiumFamilySchema,
    current: podiumCurrentSchema,
    outfits: z.array(outfitEntitlementSchema).max(PODIUM_LIMITS.maxOutfitEntries),
    mounts: z.array(mountEntitlementSchema).max(PODIUM_LIMITS.maxMountEntries),
    races: z.array(podiumRaceEntrySchema).max(PODIUM_LIMITS.maxRaces),
  })
  .strict();

export const podiumActionFailedMessageSchema = z
  .object({
    type: z.literal("podium-action-failed"),
    reason: z.enum([
      "invalid-request",
      "not-owned",
      "out-of-reach",
      "stale-item",
      "no-house-access",
      "rate-limited",
      "busy",
    ]),
  })
  .strict();
export type PodiumActionFailedReason = z.infer<
  typeof podiumActionFailedMessageSchema
>["reason"];
