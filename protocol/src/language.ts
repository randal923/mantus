import { z } from "zod";

export const LANGUAGES = ["en", "pt-BR"] as const;

export const languageSchema = z.enum(LANGUAGES);

export type Language = z.infer<typeof languageSchema>;
