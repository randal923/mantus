"use client";

import type { ForgeStateMessage } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface ForgeResourceBarProps {
  forge: ForgeStateMessage;
  /** Sprite ids resolved from the wiki catalog, when available. */
  sliverSpriteId?: number;
  coreSpriteId?: number;
}

/** Dust, sliver, and core balances exactly as the server reported them. */
export function ForgeResourceBar({
  forge,
  sliverSpriteId,
  coreSpriteId,
}: ForgeResourceBarProps) {
  const { t } = useAppTranslation();

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded border border-ui-gold/15 bg-black/25 px-3 py-2 text-sm">
      <span className="flex items-center gap-1.5" title={t("forge.dust")}>
        <span className="text-ui-muted">{t("forge.dust")}</span>
        <span className="text-ui-gold">
          {forge.dusts} / {forge.dustLimit}
        </span>
      </span>
      <span className="flex items-center gap-1.5" title={t("forge.slivers")}>
        {sliverSpriteId !== undefined && (
          <SpriteIcon spriteId={sliverSpriteId} scale={0.75} />
        )}
        <span className="text-ui-muted">{t("forge.slivers")}</span>
        <span className="text-ui-gold">{forge.slivers.toLocaleString()}</span>
      </span>
      <span className="flex items-center gap-1.5" title={t("forge.cores")}>
        {coreSpriteId !== undefined && (
          <SpriteIcon spriteId={coreSpriteId} scale={0.75} />
        )}
        <span className="text-ui-muted">{t("forge.cores")}</span>
        <span className="text-ui-gold">{forge.cores.toLocaleString()}</span>
      </span>
    </div>
  );
}
