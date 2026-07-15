import { z } from "zod";

export const positionSchema = z
  .object({
    x: z.number().int().min(0).max(65_535),
    y: z.number().int().min(0).max(65_535),
    z: z.number().int().min(0).max(15),
  })
  .strict();

export type Position = Readonly<z.infer<typeof positionSchema>>;
