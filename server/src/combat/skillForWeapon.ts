import type { Skill } from "@tibia/protocol";

export function skillForWeapon(weaponType: string | undefined): Skill {
  if (weaponType === "club") return "club";
  if (weaponType === "sword") return "sword";
  if (weaponType === "axe") return "axe";
  if (weaponType === "distance") return "distance";
  return "fist";
}
