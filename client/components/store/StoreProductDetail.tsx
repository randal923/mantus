"use client";

import type { StoreProduct } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { StoreDescription } from "./StoreDescription";
import { StoreProductIcon } from "./StoreProductIcon";

interface StoreProductDetailProps {
  product: StoreProduct;
  /** null while the server's description is still in flight. */
  description: string | null;
}

/**
 * The store's right-hand detail pane: a large preview, the product name, and
 * its description. The description is fetched per selection rather than
 * shipped with every list page, exactly as the official protocol does.
 */
export function StoreProductDetail({
  product,
  description,
}: StoreProductDetailProps) {
  const { t } = useAppTranslation();
  const blocked = product.subOffers.find((offer) => offer.disabledReason);

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-ui-gold/15 bg-black/20 p-4">
      <div className="flex items-center gap-3">
        <StoreProductIcon icon={product.icon} size={96} />
        <div className="min-w-0">
          <p className="font-display text-lg text-ui-text-bright">
            {product.name}
          </p>
          <p className="text-xs tracking-wider text-ui-muted uppercase">
            {t(`store.kind.${product.kind}`, { defaultValue: product.kind })}
          </p>
        </div>
      </div>

      {blocked?.disabledReason && (
        <p
          role="status"
          className="mt-3 rounded-lg border border-amber-400/25 bg-amber-950/20 px-3 py-2 text-sm text-amber-200"
        >
          {blocked.disabledReason}
        </p>
      )}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-ui-gold/10 bg-black/25 p-3">
        {description === null ? (
          <p className="text-sm text-ui-muted">{t("store.loading")}</p>
        ) : (
          <StoreDescription description={description} />
        )}
      </div>
    </div>
  );
}
