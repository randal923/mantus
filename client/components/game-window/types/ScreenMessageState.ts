/** Tibia-style centred on-screen text: yellow look, white status, red warning. */
export interface ScreenMessageState {
  readonly id: number;
  readonly text: string;
  readonly tone: "look" | "status" | "warning";
}
