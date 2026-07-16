export type ProgressionEventType = "experience" | "skill" | "magic";

export interface ProgressionEvent {
  readonly id: string;
  readonly type: ProgressionEventType;
}
