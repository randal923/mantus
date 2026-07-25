"use client";

import { useState } from "react";
import { HOUSE_LIMITS, type HouseState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface HouseAuctionSectionProps {
  house: HouseState;
  pending: boolean;
  onBid: (houseId: number, amount: number) => void;
}

/**
 * Auction view for an unowned house: the standing bid and the bid control.
 * The minimum shown here is display only — the server recomputes the floor,
 * escrows the gold, and refunds the outbid holder inside one transaction.
 */
export function HouseAuctionSection({
  house,
  pending,
  onBid,
}: HouseAuctionSectionProps) {
  const { t, i18n } = useAppTranslation();
  const locale = i18n.language;
  const minimum = house.auction
    ? house.auction.bid + HOUSE_LIMITS.minBidIncrement
    : house.price;
  const [amount, setAmount] = useState(String(minimum));
  const parsed = Number(amount);
  const valid = Number.isInteger(parsed) && parsed >= minimum;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-button text-sm uppercase tracking-wide text-ui-muted">
        {t("house.auction.title")}
      </h3>
      {house.auction ? (
        <p className="text-sm text-ui-text-bright">
          {t("house.auction.standing", {
            amount: house.auction.bid.toLocaleString(locale),
            name: house.auction.bidderName,
          })}
          <span className="ml-2 text-ui-muted">
            {t("house.auction.endsAt", {
              date: new Date(house.auction.endsAt).toLocaleString(locale),
            })}
          </span>
        </p>
      ) : (
        <p className="text-sm text-ui-muted">{t("house.auction.none")}</p>
      )}
      {house.auction?.mine && (
        <p className="text-sm text-ui-gold">{t("house.auction.mine")}</p>
      )}
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ui-muted">
            {t("house.auction.minimum", {
              amount: minimum.toLocaleString(locale),
            })}
          </span>
          <input
            type="number"
            min={minimum}
            max={HOUSE_LIMITS.maxBid}
            step={HOUSE_LIMITS.minBidIncrement}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="w-40 rounded-md border border-ui-gold/20 bg-black/30 px-2 py-1 text-ui-text-bright"
          />
        </label>
        <Button
          variant="primary"
          disabled={pending || !valid}
          onClick={() => onBid(house.houseId, parsed)}
        >
          {t("house.auction.bid")}
        </Button>
      </div>
    </section>
  );
}
