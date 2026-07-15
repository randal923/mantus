import { z } from "zod";
import { PROTOCOL_LIMITS } from "./limits";

export const viewRangeSchema = z
  .object({
    x: z.number().int().min(1).max(PROTOCOL_LIMITS.maxViewRangeX),
    y: z.number().int().min(1).max(PROTOCOL_LIMITS.maxViewRangeY),
  })
  .strict();

export type ViewRange = Readonly<z.infer<typeof viewRangeSchema>>;
