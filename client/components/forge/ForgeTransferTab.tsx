"use client";

import { useState } from "react";
import {
  FORGE_RULES,
  FORGE_TIER_PRICES,
  type ForgeTransferMessage,
  type InventoryState,
} from "@tibia/protocol";
import { collectTransferDonors } from "../../lib/forge/collectTransferDonors";
import { collectTransferReceivers } from "../../lib/forge/collectTransferReceivers";
import { itemClassificationOf } from "../../lib/forge/itemClassificationOf";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { ForgeCostSummary } from "./ForgeCostSummary";

interface ForgeTransferTabProps {
  inventory: InventoryState;
  pending: boolean;
  onTransfer: (intent: Omit<ForgeTransferMessage, "type">) => void;
}

/**
 * Transfer: move a tier from a tier-2+ donor onto a tier-0 item of the
 * same classification and slot. The donor is consumed server-side.
 */
export function ForgeTransferTab({
  inventory,
  pending,
  onTransfer,
}: ForgeTransferTabProps) {
  const { t } = useAppTranslation();
  const [donorId, setDonorId] = useState<string | null>(null);
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const [convergence, setConvergence] = useState(false);
  const donors = collectTransferDonors(inventory);
  const donor = donors.find((item) => item.id === donorId) ?? null;
  const receivers = donor ? collectTransferReceivers(inventory, donor) : [];
  const receiver = receivers.find((item) => item.id === receiverId) ?? null;
  const classification = donor ? itemClassificationOf(donor) : 0;
  const donorTier = donor?.tier ?? 0;
  const convergible = classification === 4;
  const effectiveConvergence = convergence && convergible;
  const resultTier = effectiveConvergence ? donorTier : donorTier - 1;
  const prices = donor
    ? FORGE_TIER_PRICES[classification]?.[resultTier]
    : undefined;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ui-muted">{t("forge.transfer.hint")}</p>

      {donors.length === 0 && (
        <p className="py-8 text-center text-sm text-ui-muted">
          {t("forge.transfer.noDonors")}
        </p>
      )}

      {donors.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs tracking-widest text-ui-gold uppercase">
              {t("forge.transfer.donor")}
            </h4>
            <ul className="ui-scrollbar flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
              {donors.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setDonorId((current) =>
                        current === item.id ? null : item.id,
                      );
                      setReceiverId(null);
                    }}
                    className={`flex w-full items-center gap-3 rounded-sm border px-3 py-2 text-left transition-[border-color,background-color] ${
                      donorId === item.id
                        ? "border-ui-gold/60 bg-ui-gold/10"
                        : "border-ui-stone-light/15 bg-black/25 hover:border-ui-gold/40"
                    }`}
                  >
                    <SpriteIcon spriteId={item.spriteId} scale={1.25} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ui-text-bright capitalize">
                        {item.name}
                      </span>
                      <span className="block text-xs text-ui-muted">
                        {t("forge.tier", { tier: item.tier ?? 0 })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 text-xs tracking-widest text-ui-gold uppercase">
              {t("forge.transfer.receiver")}
            </h4>
            {!donor && (
              <p className="py-6 text-center text-sm text-ui-muted">
                {t("forge.transfer.pickDonorFirst")}
              </p>
            )}
            {donor && receivers.length === 0 && (
              <p className="py-6 text-center text-sm text-ui-muted">
                {t("forge.transfer.noReceivers")}
              </p>
            )}
            {donor && receivers.length > 0 && (
              <ul className="ui-scrollbar flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
                {receivers.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setReceiverId((current) =>
                          current === item.id ? null : item.id,
                        )
                      }
                      className={`flex w-full items-center gap-3 rounded-sm border px-3 py-2 text-left transition-[border-color,background-color] ${
                        receiverId === item.id
                          ? "border-ui-gold/60 bg-ui-gold/10"
                          : "border-ui-stone-light/15 bg-black/25 hover:border-ui-gold/40"
                      }`}
                    >
                      <SpriteIcon spriteId={item.spriteId} scale={1.25} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ui-text-bright capitalize">
                          {item.name}
                        </span>
                        <span className="block text-xs text-ui-muted">
                          {t("forge.transfer.becomes", { tier: resultTier })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {donor && receiver && prices && (
        <>
          {convergible && (
            <Checkbox
              checked={convergence}
              disabled={pending}
              onChange={(event) => setConvergence(event.target.checked)}
              label={t("forge.convergence")}
            />
          )}
          <ForgeCostSummary
            goldCost={
              effectiveConvergence
                ? prices.convergenceTransferPrice
                : prices.regularPrice
            }
            dustCost={
              effectiveConvergence
                ? FORGE_RULES.convergenceTransferDustCost
                : FORGE_RULES.transferDustCost
            }
            coreCost={prices.corePrice}
            successPercent={null}
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                onTransfer({
                  donorItemId: donor.id,
                  receiverItemId: receiver.id,
                  convergence: effectiveConvergence,
                })
              }
            >
              {t("forge.transfer.submit")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
