import type { ReactNode } from "react";

export interface GameWindowStoreProviderProps {
  accessToken: string;
  onLogout: () => void | Promise<void>;
  children: ReactNode;
}
