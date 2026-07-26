"use client";

import type { ImbuementOption } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface ImbuementOptionRowProps {
  option: ImbuementOption;
  pending: boolean;
  onApply: () => void;
}

/** One applicable imbuement with price and material availability. */
export function ImbuementOptionRow({
  option,
  pending,
  onApply,
}: ImbuementOptionRowProps) {
  const { t } = useAppTranslation();

  return (
    <li className="rounded-sm border border-ui-stone-light/15 bg-black/25 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm text-ui-text-bright">
              {option.name}
            </span>
            {option.premium && (
              <span className="rounded-sm border border-ui-gold/40 bg-ui-gold/10 px-1.5 py-0.5 text-xs text-ui-gold">
                {t("imbuement.premium")}
              </span>
            )}
          </span>
          {option.description && (
            <span className="block text-xs text-ui-muted">
              {option.description}
            </span>
          )}
        </span>
        <span className="shrink-0 text-sm text-ui-gold">
          {t("imbuement.price", { gold: option.priceGold.toLocaleString() })}
        </span>
        <Button
          size="sm"
          variant="primary"
          disabled={pending || !option.canApply}
          onClick={onApply}
        >
          {t("imbuement.apply")}
        </Button>
      </div>
      {option.materials.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {option.materials.map((material) => (
            <li
              key={material.itemTypeId}
              className={`text-xs ${
                material.available >= material.count
                  ? "text-ui-muted"
                  : "text-red-300"
              }`}
            >
              {t("imbuement.material", {
                name: material.name,
                available: material.available,
                required: material.count,
              })}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
