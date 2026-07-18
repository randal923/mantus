import type { DamageType } from "@tibia/protocol";

export function effectForDamage(type: DamageType): number {
  if (type === "energy") return 12;
  if (type === "earth") return 17;
  if (type === "fire") return 16;
  if (type === "ice") return 44;
  if (type === "holy") return 40;
  if (type === "death") return 18;
  if (type === "healing") return 13;
  return 1;
}
