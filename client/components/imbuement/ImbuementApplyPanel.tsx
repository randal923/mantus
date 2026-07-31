"use client";

import type { ImbuementOption } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";
import { Button } from "../ui/Button";
import { ImbuementIcon } from "./ImbuementIcon";
import { ImbuementMaterialBox } from "./ImbuementMaterialBox";
import { ImbuementPanel } from "./ImbuementPanel";

interface ImbuementApplyPanelProps {
  option: ImbuementOption;
  /** Sprite ids for the astral sources, keyed by item type. */
  spriteIdOf: (itemTypeId: number) => number | undefined;
  pending: boolean;
  /** Scroll mode forges a scroll instead of imbuing the picked item. */
  mode: "item" | "scroll";
  onApply: () => void;
}

/**
 * Tibia's action panel for an empty slot: the astral sources feeding into the
 * imbuement, then the price and the confirm button. There is no success roll
 * on this server — Canary's XML percent is display-only — so the odds Tibia
 * prints here would be a fiction and are left out.
 */
export function ImbuementApplyPanel({
  option,
  spriteIdOf,
  pending,
  mode,
  onApply,
}: ImbuementApplyPanelProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const title =
    mode === "scroll"
      ? t("imbuement.forgeScrollWith", { name: option.name })
      : t("imbuement.imbueSlotWith", { name: option.name });

  return (
    <ImbuementPanel title={title}>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <ul className="flex min-w-0 flex-wrap gap-2">
          {option.materials.map((material) => (
            <ImbuementMaterialBox
              key={material.itemTypeId}
              material={material}
              spriteId={spriteIdOf(material.itemTypeId)}
            />
          ))}
        </ul>
        <span aria-hidden className="text-lg text-ui-muted">
          →
        </span>
        <span className="flex size-14 shrink-0 items-center justify-center rounded-sm border border-ui-gold/40 bg-black/45">
          <ImbuementIcon iconId={option.iconId} size={44} />
        </span>
        <div className="ml-auto flex shrink-0 flex-col items-end gap-2">
          <span className="text-base text-ui-gold tabular-nums">
            {t("imbuement.price", {
              gold: option.priceGold.toLocaleString(language),
            })}
          </span>
          <Button
            variant="primary"
            disabled={pending || !option.canApply}
            onClick={onApply}
          >
            {mode === "scroll"
              ? t("imbuement.forgeScroll")
              : t("imbuement.apply")}
          </Button>
        </div>
      </div>
    </ImbuementPanel>
  );
}
