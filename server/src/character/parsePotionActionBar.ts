import {
  potionActionBarSchema,
  type PotionActionBar,
} from "@tibia/protocol";

export function parsePotionActionBar(raw: unknown): PotionActionBar {
  const candidate =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as { slots?: unknown }).slots
      : raw;
  const parsed = potionActionBarSchema.safeParse(candidate);
  return parsed.success ? parsed.data : [];
}
