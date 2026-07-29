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

  return (
    <li
      className={`flex gap-3 rounded-xl border p-2.5 transition-[border-color,background-color] ${
        selected
          ? "border-cyan-300/50 bg-cyan-950/20"
          : "border-ui-gold/15 bg-black/20"
      } ${allDisabled ? "opacity-50" : ""}`}
    >
      <StoreProductIcon icon={product.icon} size={48} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          aria-pressed={selected}
          onClick={onSelect}
          className="block max-w-full truncate rounded font-display text-sm text-ui-text-bright focus-visible:ring-2 focus-visible:ring-cyan-200/60 focus-visible:outline-none"
        >
          {product.name}
        </button>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
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
