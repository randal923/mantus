"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PixelImage } from "../ui/PixelImage";

interface RewardWallPremiumPanelProps {
  premium: boolean;
}

/** Explains which reward column the account is on (Canary's two messages). */
export function RewardWallPremiumPanel({
  premium,
}: RewardWallPremiumPanelProps) {
  const { t } = useAppTranslation();

  return (
    <section className="flex items-center justify-between gap-3 rounded-md border border-ui-stone-light/15 bg-black/20 px-3 py-2">
      <p className="min-w-0 flex-1 text-sm text-ui-text">
        {t(premium ? "dailyRewards.premiumOn" : "dailyRewards.premiumOff")}
      </p>
      <span
        className={`flex items-center gap-1 text-xs ${
          premium ? "text-ui-gold" : "text-ui-muted"
        }`}
      >
        <PixelImage
          src="reward-wall/premium-badge.png"
          sheetWidth={36}
          sheetHeight={36}
          scale={0.6}
        />
        {t(`characters.accountTiers.${premium ? "premium" : "free"}`)}
      </span>
    </section>
  );
}
