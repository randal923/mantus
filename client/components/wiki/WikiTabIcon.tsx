import Image from "next/image";

type WikiTabIconName = "items" | "bestiary" | "bosstiary";

interface WikiTabIconProps {
  name: WikiTabIconName;
}

export function WikiTabIcon({ name }: WikiTabIconProps) {
  return (
    <span className="relative block h-9 w-12 shrink-0 overflow-hidden">
      <Image
        src={`/assets/cyclopedia/tabs/${name}.png`}
        alt=""
        aria-hidden
        width={150}
        height={34}
        className="absolute top-0 left-0 h-[34px] w-[150px] max-w-none [image-rendering:pixelated]"
      />
    </span>
  );
}
