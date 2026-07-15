import type { Language } from "@tibia/protocol";

export function getBrowserLanguage(browserLanguage: string): Language {
  return browserLanguage.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}
