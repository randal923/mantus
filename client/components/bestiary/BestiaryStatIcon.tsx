import Image from "next/image";

export type BestiaryStatIconName =
  | "hitpoints"
  | "experience"
  | "speed"
  | "armor"
  | "mitigation"
  | "bonus-points";

interface BestiaryStatIconProps {
  name: BestiaryStatIconName;
}

export function BestiaryStatIcon({ name }: BestiaryStatIconProps) {
  return (
    <Image
      src={`/assets/cyclopedia/stats/${name}.png`}
      alt=""
      aria-hidden
      width={18}
      height={18}
      className="size-[18px] object-contain [image-rendering:pixelated]"
    />
  );
}
