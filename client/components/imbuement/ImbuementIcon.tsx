import Image from "next/image";
import { imbuementIconSrc } from "../../lib/imbuement/imbuementIconSrc";

interface ImbuementIconProps {
  /** Server-sent icon id; 0 renders the empty-slot placeholder. */
  iconId: number;
  size?: number;
  className?: string;
}

/** One imbuement's Tibia icon, drawn at a fixed square size. */
export function ImbuementIcon({
  iconId,
  size = 32,
  className,
}: ImbuementIconProps) {
  return (
    <Image
      src={imbuementIconSrc(iconId)}
      alt=""
      width={size}
      height={size}
      className={`[image-rendering:pixelated] ${className ?? ""}`}
    />
  );
}
