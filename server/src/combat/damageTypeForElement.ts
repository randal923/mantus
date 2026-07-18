import type { DamageType } from "@tibia/protocol";

export function damageTypeForElement(element: string | undefined): DamageType {
  if (element === "energy") return "energy";
  if (element === "earth") return "earth";
  if (element === "fire") return "fire";
  if (element === "ice") return "ice";
  if (element === "holy") return "holy";
  if (element === "death") return "death";
  return "physical";
}
