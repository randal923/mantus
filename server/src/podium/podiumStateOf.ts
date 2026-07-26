import { podiumCurrentSchema, type PodiumCurrent } from "@tibia/protocol";
import { z } from "zod";

/** What the item row stores; lookTypeEx carries item-sprite monsters. */
export type PodiumStored = PodiumCurrent & { readonly lookTypeEx: number };

const storedSchema = podiumCurrentSchema.extend({
  lookTypeEx: z.number().int().min(0).max(65_535),
});

const DEFAULT_STORED: PodiumStored = {
  podiumVisible: true,
  // Canary's LookDirection fallback: south.
  direction: 2,
  lookType: 0,
  head: 0,
  body: 0,
  legs: 0,
  feet: 0,
  addons: 0,
  mountLookType: 0,
  raceId: 0,
  monsterVisible: true,
  lookTypeEx: 0,
};

/** The podium bag from an item's attributes; invalid shapes read as unset. */
export function podiumStateOf(
  attributes: Readonly<Record<string, unknown>>,
): PodiumStored {
  const parsed = storedSchema.safeParse(attributes.podium);
  return parsed.success ? parsed.data : DEFAULT_STORED;
}
