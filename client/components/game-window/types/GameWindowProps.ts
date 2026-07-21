export interface GameWindowProps {
  accessToken: string;
  onLogout: () => void | Promise<void>;
}
