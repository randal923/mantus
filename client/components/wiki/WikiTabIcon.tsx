import Image from "next/image";

type WikiTabIconName = "items" | "bestiary" | "bosstiary";

interface WikiTabIconProps {
  name: WikiTabIconName;
}

export function WikiTabIcon({ name }: WikiTabIconProps) {
  return (
    <span className="flex h-9 w-12 shrink-0 items-center justify-center">
      <Image
        src={`/assets/cyclopedia/tabs/${name}.png`}
        alt=""
        aria-hidden
        width={48}
        height={32}
        className="h-8 w-12 object-contain [image-rendering:pixelated]"
      />
    </span>
  );
}
