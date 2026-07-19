"use client";

import type { TradeOfferEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ItemSlot } from "../inventory/ItemSlot";

interface TradeOfferGridProps {
  label: string;
  offer: ReadonlyArray<TradeOfferEntry> | null;
  accepted: boolean;
}

/** One side of the trade: the flat offered subtree, root first. */
export function TradeOfferGrid({ label, offer, accepted }: TradeOfferGridProps) {
  const { t } = useAppTranslation();
  return (
    <section aria-label={label} className="flex min-w-0 flex-1 flex-col gap-2">
      <header className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm text-ui-text-bright">{label}</h3>
        {accepted && (
          <span className="shrink-0 text-xs text-ui-accent">
            {t("trade.accepted")}
          </span>
        )}
      </header>
      {offer ? (
        <ul className="grid grid-cols-4 gap-2" role="list">
          {offer.map((entry) => (
            <li
              key={entry.item.id}
              className={entry.depth > 0 ? "opacity-80" : undefined}
              aria-label={
                entry.depth > 0
                  ? t("trade.nestedItem", { name: entry.item.name })
                  : entry.item.name
              }
            >
              <ItemSlot item={entry.item} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ui-text/70">{t("trade.waitingForOffer")}</p>
      )}
    </section>
  );
}
