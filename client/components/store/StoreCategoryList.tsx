"use client";

import type { StoreCategory } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import Image from "next/image";
import { StoreCategoryButton } from "./StoreCategoryButton";
import { StoreProductIcon } from "./StoreProductIcon";

interface StoreCategoryListProps {
  categories: ReadonlyArray<StoreCategory>;
  selectedId: string | null;
  onHome: () => void;
  onSelect: (categoryId: string) => void;
}

/**
 * The store's left-hand category tree: top-level areas with their
 * subcategories nested beneath, plus the Home entry the window opens on.
 * A parent that has children is a heading, not a button — it holds no
 * products of its own.
 */
export function StoreCategoryList({
  categories,
  selectedId,
  onHome,
  onSelect,
}: StoreCategoryListProps) {
  const { t } = useAppTranslation();
  const parents = categories.filter((category) => category.parentId === null);

  return (
    <nav
      aria-label={t("store.categories")}
      className="flex min-h-0 flex-col gap-0.5 overflow-y-auto rounded-xl border border-ui-gold/15 bg-black/25 p-2"
    >
      <button
        type="button"
        aria-current={selectedId === null ? "page" : undefined}
        onClick={onHome}
        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
          selectedId === null
            ? "border border-cyan-300/40 bg-cyan-950/30 text-ui-text-bright"
            : "border border-transparent text-ui-text hover:bg-white/5"
        }`}
      >
        <Image
          src="/assets/store/home.png"
          alt=""
          width={16}
          height={16}
          className="shrink-0 [image-rendering:pixelated]"
        />
        <span className="font-display text-sm tracking-wide">
          {t("store.home")}
        </span>
      </button>

      {parents.map((parent) => {
        const children = categories.filter(
          (category) => category.parentId === parent.id,
        );
        if (children.length === 0) {
          return (
            <StoreCategoryButton
              key={parent.id}
              category={parent}
              selected={selectedId === parent.id}
              onSelect={onSelect}
            />
          );
        }
        return (
          <div key={parent.id} className="mt-1">
            {/*
              A div, not a <p>: the icon renders element boxes, which are not
              phrasing content and cannot legally sit inside a paragraph.
            */}
            <div className="flex items-center gap-2.5 px-2.5 py-1.5 font-display text-xs tracking-[0.18em] text-ui-muted uppercase">
              <StoreProductIcon icon={parent.icon} size={18} />
              {parent.name}
            </div>
            {children.map((child) => (
              <StoreCategoryButton
                key={child.id}
                category={child}
                nested
                selected={selectedId === child.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );
}
