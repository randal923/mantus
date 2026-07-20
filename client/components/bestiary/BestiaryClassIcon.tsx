import Image from "next/image";
import type { BestiaryClass } from "@tibia/protocol";

const CLASS_ICON_FILES: Record<BestiaryClass, string> = {
  Amphibic: "amphibic",
  Aquatic: "aquatic",
  Bird: "bird",
  Construct: "construct",
  Demon: "demon",
  Dragon: "dragon",
  Elemental: "elemental",
  "Extra Dimensional": "extra_dimensional",
  Fey: "fey",
  Giant: "giant",
  Human: "human",
  Humanoid: "humanoid",
  Inkborn: "inkborn",
  Lycanthrope: "lycanthrope",
  Magical: "magical",
  Mammal: "mammal",
  Plant: "plant",
  Reptile: "reptile",
  Slime: "slime",
  Undead: "undead",
  Vermin: "vermin",
};

interface BestiaryClassIconProps {
  bestiaryClass: BestiaryClass;
  size?: number;
}

export function BestiaryClassIcon({
  bestiaryClass,
  size = 64,
}: BestiaryClassIconProps) {
  return (
    <Image
      src={`/assets/cyclopedia/classes/${CLASS_ICON_FILES[bestiaryClass]}.png`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className="object-contain [image-rendering:pixelated]"
    />
  );
}
