import type { Vocation } from "./characterTypes";

interface VocationOption {
  value: Vocation;
}

export const VOCATION_OPTIONS: ReadonlyArray<VocationOption> = [
  {
    value: "Knight",
  },
  {
    value: "Paladin",
  },
  {
    value: "Sorcerer",
  },
  {
    value: "Druid",
  },
];
