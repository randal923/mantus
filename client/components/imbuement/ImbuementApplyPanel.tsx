"use client";

import Image from "next/image";
import type { ImbuementOption } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import { ImbuementIcon } from "./ImbuementIcon";
import { ImbuementMaterialBox } from "./ImbuementMaterialBox";

interface ImbuementApplyPanelProps {
  option: ImbuementOption | null;
  /** Sprite ids for the astral sources, keyed by item type. */
  spriteIdOf: (itemTypeId: number) => number | undefined;
  pending: boolean;
  /** Scroll mode forges a scroll instead of imbuing the picked item. */
  mode: "item" | "scroll";
  onApply: () => void;
}

/** Astral sources flowing into the selected imbuement and its server price. */
export function ImbuementApplyPanel({
  option,
  spriteIdOf,
  pending,
  mode,
  onApply,
}: ImbuementApplyPanelProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const placeholderCount = Math.max(0, 4 - (option?.materials.length ?? 0));

  return (
    <section className="border border-ui-stone-light/15 bg-black/25 p-3">
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold text-ui-gold">
          {t("imbuement.requiresSources")}
        </h3>
        <span className="font-display text-base font-bold text-ui-text-bright">
          {t("imbuement.successRate")}:{" "}
          <span
            className={option?.canApply ? "text-ui-success" : "text-ui-accent-light"}
          >
            {option?.canApply ? "100%" : "0%"}
          </span>
        </span>
      </div>

      <div className="grid min-w-0 items-center gap-3 lg:grid-cols-[minmax(0,1fr)_auto_10rem]">
        <ul className="grid min-w-0 grid-cols-[repeat(2,6rem)] justify-center gap-2 sm:grid-cols-[repeat(4,6rem)] lg:justify-start">
          {option?.materials.map((material) => (
            <ImbuementMaterialBox
              key={material.itemTypeId}
              material={material}
              spriteId={spriteIdOf(material.itemTypeId)}
            />
          ))}
          {Array.from({ length: placeholderCount }, (_, index) => (
            <li
              key={`empty-source-${index}`}
              aria-hidden
              className="flex size-24 min-w-0 items-center justify-center border border-ui-stone-light/15 bg-black/35 opacity-55"
            >
              <span className="size-12 border border-ui-stone-light/5 bg-black/20" />
            </li>
          ))}
        </ul>

        <span
          aria-hidden
          className="hidden text-center font-display text-5xl tracking-[-0.35em] text-ui-muted/35 lg:block"
        >
          »»
        </span>

        <div className="flex min-w-0 flex-col items-center gap-1.5">
          <span className="flex size-16 items-center justify-center border border-ui-stone-light/20 bg-black/45">
            <ImbuementIcon iconId={option?.iconId ?? 0} size={48} />
          </span>
          <span className="flex items-center gap-2 text-base text-ui-gold tabular-nums">
            <Image
              src="/assets/cyclopedia/currency/gold.png"
              alt=""
              width={18}
              height={18}
              className="[image-rendering:pixelated]"
            />
            {(option?.priceGold ?? 0).toLocaleString(language)}
          </span>
          <Button
            variant="primary"
            size="sm"
            disabled={pending || !option?.canApply}
            onClick={onApply}
          >
            {mode === "scroll"
              ? t("imbuement.forgeScroll")
              : t("imbuement.apply")}
          </Button>
        </div>
      </div>
    </section>
  );
}
