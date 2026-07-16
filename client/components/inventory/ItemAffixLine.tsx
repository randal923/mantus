import type { ItemAffix } from "@tibia/protocol";

interface ItemAffixLineProps {
  affix: ItemAffix;
}

export function ItemAffixLine({ affix }: ItemAffixLineProps) {
  return (
    <li className="flex gap-2 text-sm leading-5 text-ui-text/90">
      <span
        aria-hidden
        className="mt-[7px] size-1.5 shrink-0 rotate-45 border border-ui-stone-light/70 bg-ui-stone/40"
      />
      <span>
        {affix.text}
      </span>
    </li>
  );
}
