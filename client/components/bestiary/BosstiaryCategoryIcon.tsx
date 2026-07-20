import Image from "next/image";
import type { BossCategory } from "@tibia/protocol";

interface BosstiaryCategoryIconProps {
  category: BossCategory;
  size?: number;
}

export function BosstiaryCategoryIcon({
  category,
  size = 18,
}: BosstiaryCategoryIconProps) {
  return (
    <Image
      src={`/assets/cyclopedia/boss/${category}.png`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className="object-contain [image-rendering:pixelated]"
    />
  );
}
