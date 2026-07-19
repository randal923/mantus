"use client";

import { useState } from "react";
import { HOUSE_LIMITS, type HouseState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface HouseTransferSectionProps {
  house: HouseState;
  pending: boolean;
  onOfferTransfer: (targetName: string, price: number) => void;
  onCancelTransfer: () => void;
}

/** Owner view: the pending outgoing offer, or the offer form. */
export function HouseTransferSection({
  house,
  pending,
  onOfferTransfer,
  onCancelTransfer,
}: HouseTransferSectionProps) {
  const { t, i18n } = useAppTranslation();
  const [targetName, setTargetName] = useState("");
  const [price, setPrice] = useState("");
  if (house.pendingTransfer) {
    return (
      <section className="flex items-center justify-between gap-2 rounded-md bg-black/20 px-3 py-2">
        <p className="text-sm text-ui-text">
          {t("house.pendingTransfer", {
            name: house.pendingTransfer.targetName,
            price: house.pendingTransfer.price.toLocaleString(i18n.language),
          })}
        </p>
        <Button variant="danger" disabled={pending} onClick={onCancelTransfer}>
          {t("house.cancelTransfer")}
        </Button>
      </section>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = targetName.trim();
        const parsedPrice = Number(price || "0");
        if (
          !trimmed ||
          !Number.isInteger(parsedPrice) ||
          parsedPrice < 0 ||
          parsedPrice > HOUSE_LIMITS.maxTransferPrice
        ) {
          return;
        }
        onOfferTransfer(trimmed, parsedPrice);
        setTargetName("");
        setPrice("");
      }}
    >
      <Input
        label={t("house.transferTarget")}
        aria-label={t("house.transferTarget")}
        value={targetName}
        placeholder={t("house.transferTargetPlaceholder")}
        maxLength={20}
        onChange={(event) => setTargetName(event.target.value)}
      />
      <Input
        label={t("house.transferPrice")}
        aria-label={t("house.transferPrice")}
        value={price}
        placeholder="0"
        inputMode="numeric"
        onChange={(event) =>
          setPrice(event.target.value.replace(/[^0-9]/g, ""))
        }
      />
      <Button type="submit" variant="primary" disabled={pending}>
        {t("house.offerTransfer")}
      </Button>
    </form>
  );
}
