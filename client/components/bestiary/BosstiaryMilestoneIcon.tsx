import Image from "next/image";

type MilestoneMetal = "bronze" | "silver" | "gold";

interface BosstiaryMilestoneIconProps {
  active: boolean;
  metal: MilestoneMetal;
}

export function BosstiaryMilestoneIcon({
  active,
  metal,
}: BosstiaryMilestoneIconProps) {
  return (
    <Image
      src={`/assets/cyclopedia/boss/star-${active ? metal : "inactive"}.png`}
      alt=""
      aria-hidden
      width={18}
      height={20}
      className="object-contain [image-rendering:pixelated]"
    />
  );
}
