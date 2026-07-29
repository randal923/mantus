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
      className={`flex w-full items-center gap-2.5 rounded-lg py-2 pr-2.5 text-left transition-colors ${
        nested ? "pl-6" : "pl-2.5"
      } ${
        selected
          ? "border border-cyan-300/40 bg-cyan-950/30 text-ui-text-bright shadow-[inset_3px_0_0_rgba(103,232,249,0.55)]"
          : "border border-transparent text-ui-text hover:bg-white/5"
      }`}
    >
      <StoreProductIcon icon={category.icon} size={24} />
      <span className="truncate text-sm">{category.name}</span>
    </button>
  );
}
