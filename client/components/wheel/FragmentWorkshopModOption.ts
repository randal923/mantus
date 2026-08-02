export type FragmentWorkshopModKind = "basic" | "supreme";

export type FragmentWorkshopFilter =
  | "all"
  | FragmentWorkshopModKind
  | "socketed"
  | "grade-0"
  | "grade-1"
  | "grade-2"
  | "grade-3";

export interface FragmentWorkshopModOption {
  kind: FragmentWorkshopModKind;
  id: number;
  name: string | undefined;
  grade: number;
  lines: ReadonlyArray<string>;
  owned: number;
  socketed: boolean;
}
