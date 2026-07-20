import Image from "next/image";
import type { DamageType } from "@tibia/protocol";

interface BestiaryResistanceIconProps {
  element: DamageType;
}

export function BestiaryResistanceIcon({
  element,
}: BestiaryResistanceIconProps) {
  return (
    <Image
      src={`/assets/cyclopedia/resistances/${element}.png`}
      alt=""
      aria-hidden
      width={18}
      height={18}
      className="size-[18px] object-contain [image-rendering:pixelated]"
    />
  );
}
