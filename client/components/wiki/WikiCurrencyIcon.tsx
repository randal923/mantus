import Image from "next/image";

type WikiCurrencyIconName = "charm" | "gold";

interface WikiCurrencyIconProps {
  name: WikiCurrencyIconName;
}

export function WikiCurrencyIcon({ name }: WikiCurrencyIconProps) {
  return (
    <Image
      src={`/assets/cyclopedia/currency/${name}.png`}
      alt=""
      aria-hidden
      width={18}
      height={18}
      className="size-[18px] object-contain [image-rendering:pixelated]"
    />
  );
}
