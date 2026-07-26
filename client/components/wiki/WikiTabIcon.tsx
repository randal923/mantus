import Image from "next/image";

type WikiTabIconName = "items" | "bestiary" | "bosstiary" | "character";

/** The character tab reuses an existing stat png; no new asset imports. */
const TAB_ICON_SRC: Record<WikiTabIconName, string> = {
  items: "/assets/cyclopedia/tabs/items.png",
  bestiary: "/assets/cyclopedia/tabs/bestiary.png",
  bosstiary: "/assets/cyclopedia/tabs/bosstiary.png",
  character: "/assets/cyclopedia/stats/hitpoints.png",
};

interface WikiTabIconProps {
  name: WikiTabIconName;
}

export function WikiTabIcon({ name }: WikiTabIconProps) {
  return (
    <span className="flex h-9 w-12 shrink-0 items-center justify-center">
      <Image
        src={TAB_ICON_SRC[name]}
        alt=""
        aria-hidden
        width={48}
        height={32}
        className="h-8 w-12 object-contain [image-rendering:pixelated]"
      />
    </span>
  );
}
