"use client";

import Image from "next/image";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";

interface CurrencyCountersProps {
  gold: number;
  mantusCoins: number;
  storeOpen: boolean;
  onStore: () => void;
}

export function CurrencyCounters({
  gold,
  mantusCoins,
  storeOpen,
  onStore,
}: CurrencyCountersProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);

  return (
    <section
      aria-label={t("currency.wallet")}
      className="flex shrink-0 items-center gap-1.5"
    >
      <div
        title={t("currency.gold")}
        className="flex h-10 min-w-20 items-center gap-2 rounded-xl border border-ui-gold/25 bg-black/35 px-2.5 shadow-inner shadow-black/50"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-amber-300/25 bg-amber-950/35">
          <Image
            src="/assets/cyclopedia/currency/gold.png"
            alt=""
            width={20}
            height={20}
            className="[image-rendering:pixelated]"
          />
        </span>
        <span className="min-w-0 font-display text-sm font-bold tabular-nums text-amber-200">
          {gold.toLocaleString(language)}
        </span>
      </div>

      <div
        className={`flex h-10 min-w-24 items-center rounded-xl border bg-black/35 pl-1.5 shadow-inner shadow-black/50 transition-[border-color,box-shadow] ${
          storeOpen
            ? "border-cyan-300/60 shadow-[0_0_18px_rgba(62,214,219,0.14)]"
            : "border-cyan-300/25"
        }`}
      >
        <Image
          src="/assets/ui/mantus-coin.png"
          alt=""
          width={30}
          height={30}
          className="shrink-0 drop-shadow-[0_0_7px_rgba(77,226,223,0.45)]"
        />
        <span
          title={t("currency.mantusCoins")}
          className="min-w-0 flex-1 px-1.5 text-center font-display text-sm font-bold tabular-nums text-cyan-100"
        >
          {mantusCoins.toLocaleString(language)}
        </span>
        <button
          type="button"
          aria-label={t("store.open")}
          aria-pressed={storeOpen}
          onClick={onStore}
          className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg border border-cyan-200/35 bg-cyan-950/50 font-display text-xl leading-none text-cyan-100 outline-none transition-[background-color,border-color,filter] hover:border-cyan-100/60 hover:bg-cyan-900/60 hover:brightness-125 focus-visible:ring-2 focus-visible:ring-cyan-200/60"
        >
          +
        </button>
      </div>
    </section>
  );
}
