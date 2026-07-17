import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Input } from "../ui/Input";
import type {
  AuctionHouseItem,
  AuctionItemCategory,
} from "./auctionTypes";

type AuctionCategoryFilter = "all" | AuctionItemCategory;

interface AuctionItemBrowserProps {
  items: ReadonlyArray<AuctionHouseItem>;
  category: AuctionCategoryFilter;
  search: string;
  selectedItemId?: string;
  onCategoryChange: (category: AuctionCategoryFilter) => void;
  onSearchChange: (search: string) => void;
  onItemSelect: (itemId: string) => void;
}

const CATEGORIES: ReadonlyArray<AuctionCategoryFilter> = [
  "all",
  "weapons",
  "armor",
  "shields",
  "spellbooks",
  "consumables",
  "runes",
  "valuables",
];

export function AuctionItemBrowser({
  items,
  category,
  search,
  selectedItemId,
  onCategoryChange,
  onSearchChange,
  onItemSelect,
}: AuctionItemBrowserProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);

  return (
    <aside
      aria-label={t("auction.browse")}
      className="flex min-h-96 flex-col overflow-hidden rounded-xl border border-ui-stone-light/15 bg-black/25 shadow-inner shadow-black/40 lg:col-span-4 lg:min-h-0"
    >
      <header className="border-b border-ui-gold/15 px-3 py-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-xs font-semibold tracking-[0.16em] text-ui-gold uppercase">
            {t("auction.browse")}
          </h2>
          <span className="rounded-full border border-ui-stone-light/15 bg-black/35 px-2 py-0.5 text-[10px] tabular-nums text-ui-muted">
            {t("auction.itemCount", { count: items.length })}
          </span>
        </div>
        <Input
          label={t("auction.search")}
          type="search"
          value={search}
          placeholder={t("auction.searchPlaceholder")}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
      </header>

      <nav
        aria-label={t("auction.categoriesLabel")}
        className="ui-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b border-ui-gold/15 p-2 xl:grid xl:max-h-48 xl:grid-cols-2 xl:overflow-y-auto"
      >
        {CATEGORIES.map((categoryOption) => {
          const active = category === categoryOption;

          return (
            <button
              key={categoryOption}
              type="button"
              aria-pressed={active}
              onClick={() => onCategoryChange(categoryOption)}
              className={`min-w-max rounded-md border px-2.5 py-2 text-left text-[10px] font-semibold tracking-wider uppercase outline-none transition-[border-color,background-color,color] focus-visible:ring-2 focus-visible:ring-ui-gold/60 xl:min-w-0 ${
                active
                  ? "border-ui-accent-light/55 bg-ui-accent-deep/70 text-ui-text-bright"
                  : "border-ui-stone-light/15 bg-ui-panel-deep/45 text-ui-muted hover:border-ui-gold/35 hover:text-ui-text"
              }`}
            >
              {t(`auction.categories.${categoryOption}`)}
            </button>
          );
        })}
      </nav>

      <div className="ui-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-ui-stone-light/20 bg-black/15 px-5 text-center text-xs leading-5 text-ui-muted">
            {t("auction.noItems")}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item) => {
              const selected = selectedItemId === item.id;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onItemSelect(item.id)}
                    className={`group flex w-full items-center gap-3 rounded-lg border p-2 text-left outline-none transition-[border-color,background-color,filter] focus-visible:ring-2 focus-visible:ring-ui-gold/60 ${
                      selected
                        ? "border-ui-accent-light/45 bg-ui-accent-deep/45"
                        : "border-ui-stone-light/10 bg-ui-panel-deep/45 hover:border-ui-gold/30 hover:bg-white/5"
                    }`}
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-ui-stone-light/15 bg-black/40 shadow-inner shadow-black/55">
                      <SpriteIcon spriteId={item.spriteId} scale={1.25} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-ui-text-bright">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] tracking-wide text-ui-muted">
                        {t(`auction.categories.${item.category}`)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-semibold tabular-nums text-ui-text">
                        {item.averagePrice.toLocaleString(language)}
                      </span>
                      <span className="block text-[9px] tracking-wider text-ui-muted uppercase">
                        {t("auction.average")}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
