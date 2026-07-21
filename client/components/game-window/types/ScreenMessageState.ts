/** Tibia-style centered on-screen text: yellow look lines, white status. */
export interface ScreenMessageState {
  readonly id: number;
  readonly text: string;
  readonly tone: "look" | "status";
}
