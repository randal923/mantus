"use client";

import type { StoreProduct } from "@tibia/protocol";
import { StorePriceButton } from "./StorePriceButton";
import { StoreProductIcon } from "./StoreProductIcon";

interface StoreProductRowProps {
  product: StoreProduct;
  selected: boolean;
  balance: number;
  busy: boolean;
  onSelect: () => void;
  onBuy: (offerId: string) => void;
}

/**
 * One row of the store's product list, laid out like the official store's:
 * the icon on the left, the product name beside it, and a price button per
 * variant underneath the name.
 *
 * Selecting and buying are separate controls rather than a clickable row
 * wrapping the price buttons, so the buttons are never nested inside another
 * button. A row whose every variant is disabled is dimmed, the way Canary
 * dims a fully-owned product.
 */
export function StoreProductRow({
  product,
  selected,
  balance,
  busy,
  onSelect,
  onBuy,
}: StoreProductRowProps) {
  const allDisabled = product.subOffers.every((offer) => offer.disabled);
  const onlyOffer = product.subOffers.length === 1 ? product.subOffers[0] : null;

  return (
    <li
      className={`group relative grid min-h-28 grid-cols-[6rem_minmax(0,1fr)] border transition-[border-color,background-color] ${
        selected
          ? "border-ui-gold/50 bg-ui-panel-light/60"
          : "border-ui-gold/15 bg-ui-panel/70 hover:border-ui-gold/35"
      } ${allDisabled ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        aria-label={product.name}
        aria-pressed={selected}
        onClick={() => {
          onSelect();
          if (onlyOffer && onlyOffer.disabled !== true) onBuy(onlyOffer.id);
        }}
        className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-gold/60"
      />
      <div className="pointer-events-none relative flex items-center justify-center border-r border-ui-gold/15 bg-black/25 transition-colors group-hover:bg-black/15">
        <StoreProductIcon icon={product.icon} size={72} />
      </div>
      <div className="pointer-events-none relative flex min-w-0 flex-col px-3 py-2.5">
        <p className="block max-w-full truncate text-left font-display text-base font-bold text-ui-text-bright transition-colors group-hover:text-ui-gold">
          {product.name}
        </p>
        <div className="pointer-events-auto relative z-10 mt-auto flex flex-wrap justify-end gap-1.5 pt-2">
          {product.subOffers.map((offer) => (
            <StorePriceButton
              key={offer.id}
              offer={offer}
              balance={balance}
              busy={busy}
              onSelect={() => {
                onSelect();
                onBuy(offer.id);
              }}
            />
          ))}
        </div>
      </div>
    </li>
  );
}
