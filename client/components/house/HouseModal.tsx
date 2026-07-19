"use client";

import { useState } from "react";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { HouseSessionState } from "../../hooks/useHouseSession";
import { Modal } from "../ui/Modal";
import { HouseAccessSection } from "./HouseAccessSection";
import { HouseBrowserSection } from "./HouseBrowserSection";
import { HouseOffersList } from "./HouseOffersList";
import { HouseOverviewSection } from "./HouseOverviewSection";
import { HouseTransferSection } from "./HouseTransferSection";

type HouseTab = "house" | "browse";

interface HouseModalProps {
  session: HouseSessionState;
  error: string | null;
  onClose: () => void;
  onBuy: (houseId: number) => void;
  onAbandon: () => void;
  onOfferTransfer: (targetName: string, price: number) => void;
  onRespondOffer: (houseId: number, accept: boolean) => void;
  onCancelTransfer: () => void;
  onSetAccess: (
    kind: "guest" | "subowner",
    targetName: string,
    grant: boolean,
  ) => void;
  onKick: (targetCharacterId: string) => void;
  onBrowse: (townId?: number, page?: number) => void;
  onOpenHouse: (houseId: number) => void;
}

/**
 * In-game house management. Every control only sends an intent; ownership,
 * access, funds, and position are re-validated server-side at execution
 * time, so this UI is purely a view over the house-state projection.
 */
export function HouseModal({
  session,
  error,
  onClose,
  onBuy,
  onAbandon,
  onOfferTransfer,
  onRespondOffer,
  onCancelTransfer,
  onSetAccess,
  onKick,
  onBrowse,
  onOpenHouse,
}: HouseModalProps) {
  const { t } = useAppTranslation();
  const [tab, setTab] = useState<HouseTab>("house");
  const house = session.house;
  const canManage =
    house !== null &&
    (house.myAccess === "owner" || house.myAccess === "subowner");
  const tabs: ReadonlyArray<HouseTab> = ["house", "browse"];

  return (
    <Modal
      size="wide"
      title={house ? house.name : t("house.title")}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <HouseOffersList
          offers={session.incomingOffers}
          pending={session.pending}
          onRespond={onRespondOffer}
        />
        <nav
          aria-label={t("house.tabsLabel")}
          className="flex gap-1 rounded-lg border border-ui-gold/10 bg-black/20 p-1 self-start"
        >
          {tabs.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setTab(candidate)}
              className={`rounded-md px-3 py-1.5 font-button text-xs tracking-wide uppercase transition-colors ${
                tab === candidate
                  ? "bg-ui-accent/25 text-ui-text-bright"
                  : "text-ui-muted hover:text-ui-text"
              }`}
            >
              {t(`house.tabs.${candidate}`)}
            </button>
          ))}
        </nav>
        <div aria-hidden className="ui-divider" />
        {tab === "house" &&
          (house ? (
            <>
              <HouseOverviewSection
                house={house}
                pending={session.pending}
                onBuy={onBuy}
                onAbandon={onAbandon}
              />
              {canManage && (
                <>
                  <div aria-hidden className="ui-divider" />
                  <HouseAccessSection
                    house={house}
                    pending={session.pending}
                    onSetAccess={onSetAccess}
                    onKick={onKick}
                  />
                </>
              )}
              {house.myAccess === "owner" && (
                <>
                  <div aria-hidden className="ui-divider" />
                  <HouseTransferSection
                    house={house}
                    pending={session.pending}
                    onOfferTransfer={onOfferTransfer}
                    onCancelTransfer={onCancelTransfer}
                  />
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-ui-muted">{t("house.noHouseHere")}</p>
          ))}
        {tab === "browse" && (
          <HouseBrowserSection
            list={session.list}
            pending={session.pending}
            onBrowse={onBrowse}
            onOpenHouse={(houseId) => {
              onOpenHouse(houseId);
              setTab("house");
            }}
          />
        )}
        {error && (
          <p role="alert" className="text-xs text-red-300">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
