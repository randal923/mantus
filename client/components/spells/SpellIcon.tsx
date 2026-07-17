interface SpellIconProps {
  sheet: "current" | "legacy";
  index: number;
}

export function SpellIcon({ sheet, index }: SpellIconProps) {
  const iconSize = 40;
  const isCurrentSheet = sheet === "current";
  const x = isCurrentSheet ? index * iconSize : (index % 12) * iconSize;
  const y = isCurrentSheet ? 0 : Math.floor(index / 12) * iconSize;

  return (
    <span
      aria-hidden
      className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-ui-stone-light/25 bg-black/35 shadow-inner shadow-black/60"
    >
      <span
        className="block size-10 rounded-lg bg-no-repeat [image-rendering:pixelated]"
        style={{
          backgroundImage: `url("/images/game/spells/${isCurrentSheet ? "spell-icons-32x32.png" : "defaultspells.png"}")`,
          backgroundPosition: `-${x}px -${y}px`,
          backgroundSize: isCurrentSheet
            ? `${187 * iconSize}px ${iconSize}px`
            : `${12 * iconSize}px ${11 * iconSize}px`,
        }}
      />
    </span>
  );
}
