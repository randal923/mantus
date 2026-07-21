import {
  potionActionBarSchema,
  type PotionActionBar,
} from "@tibia/protocol";

export function parsePotionActionBar(raw: unknown): PotionActionBar {
  const parsed = potionActionBarSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}
