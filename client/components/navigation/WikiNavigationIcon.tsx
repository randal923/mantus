import Image from "next/image";

export function WikiNavigationIcon() {
  return (
    <span className="relative block size-5 overflow-hidden">
      <Image
        src="/assets/cyclopedia/tabs/bestiary.png"
        alt=""
        aria-hidden
        width={106}
        height={24}
        className="absolute top-0 left-0 h-6 w-[106px] max-w-none [image-rendering:pixelated]"
      />
    </span>
  );
}
