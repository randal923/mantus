import { actionBarSchema, type ActionBar } from "@tibia/protocol";

/** Stored layouts that no longer match the schema fall back to an empty bar. */
export function parseActionBar(raw: unknown): ActionBar {
  const parsed = actionBarSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}
