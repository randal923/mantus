"use client";

import type { StoreCategory } from "@tibia/protocol";
import { StoreProductIcon } from "./StoreProductIcon";

interface StoreCategoryButtonProps {
  category: StoreCategory;
  /** Subcategories sit indented under their parent heading. */
  nested?: boolean;
  selected: boolean;
  onSelect: (categoryId: string) => void;
}

export function StoreCategoryButton({
  category,
  nested = false,
  selected,
  onSelect,
}: StoreCategoryButtonProps) {
  return (
    <button
      type="button"
      aria-current={selected ? "page" : undefined}
      onClick={() => onSelect(category.id)}
      className={`flex min-h-12 w-full items-center gap-3 border py-2 pr-3 text-left transition-[border-color,background-color,color] ${
        nested ? "pl-6" : "pl-3"
      } ${
        selected
          ? "border-ui-gold/55 bg-ui-panel-light/80 text-ui-text-bright shadow-[inset_3px_0_0_rgba(154,150,141,0.7)]"
          : "border-ui-gold/10 bg-black/20 text-ui-muted hover:border-ui-gold/30 hover:bg-white/5 hover:text-ui-text"
      }`}
    >
      <StoreProductIcon icon={category.icon} size={24} />
      <span className="truncate font-display text-sm font-bold tracking-wide uppercase">
        {category.name}
      </span>
    </button>
  );
}
