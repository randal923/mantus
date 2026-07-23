"use client";

import type { HouseTransferIncomingMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface HouseOffersListProps {
  offers: ReadonlyArray<HouseTransferIncomingMessage>;
  pending: boolean;
  onRespond: (houseId: number, accept: boolean) => void;
}

/** Incoming transfer offers; accepting pays the price from the bank. */
export function HouseOffersList({
  offers,
  pending,
  onRespond,
}: HouseOffersListProps) {
  const { t, i18n } = useAppTranslation();
  if (offers.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
        {t("house.offersTitle")}
      </h3>
      <ul className="flex flex-col gap-1">
        {offers.map((offer) => (
          <li
            key={offer.houseId}
            className="flex items-center justify-between gap-2 rounded-md bg-black/20 px-3 py-2"
          >
            <p className="text-sm text-ui-text">
              {t("house.incomingOffer", {
                house: offer.houseName,
                name: offer.fromName,
                price: offer.price.toLocaleString(i18n.language),
              })}
            </p>
            <span className="flex gap-1">
              <Button
                variant="primary"
                disabled={pending}
                onClick={() => onRespond(offer.houseId, true)}
              >
                {t("house.accept")}
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => onRespond(offer.houseId, false)}
              >
                {t("house.decline")}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
