import type { Language } from "@tibia/protocol";

export interface GameWindowStoreConfig {
  accessToken: string;
  initialLanguage: Language;
  onLogout: () => void | Promise<void>;
}
