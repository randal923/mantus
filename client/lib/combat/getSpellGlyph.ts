import type { DamageType } from "@tibia/protocol";

export function getSpellGlyph(damageType: DamageType): string {
  if (damageType === "healing") return "✚";
  if (damageType === "energy") return "ϟ";
  if (damageType === "ice") return "❄";
  if (damageType === "fire") return "✦";
  if (damageType === "holy") return "✧";
  if (damageType === "death") return "◇";
  if (damageType === "earth") return "♧";
  return "⌁";
}
