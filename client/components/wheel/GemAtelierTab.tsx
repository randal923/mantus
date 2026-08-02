"use client";

import { useState } from "react";
import type {
  GemAction,
  GemActionFailedReason,
  GemStateMessage,
  WheelBaseVocation,
  WheelDomain,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { GemDetails } from "./GemDetails";
import { GemList } from "./GemList";
import { GemRevealPanel } from "./GemRevealPanel";
import { GemVessels } from "./GemVessels";

interface GemAtelierTabProps {
  gems: GemStateMessage | null;
  vocation: WheelBaseVocation;
  resonances: Readonly<Record<WheelDomain, number>>;
  pending: boolean;
  error: GemActionFailedReason | null;
  onAction: (action: GemAction) => void;
}

/** Gem Atelier arranged like Tibia's vessel, details, and 5×3 collection UI. */
export function GemAtelierTab({
  gems,
  vocation,
  resonances,
  pending,
  error,
  onAction,
}: GemAtelierTabProps) {
  const { t } = useAppTranslation();
  const [selectedGemId, setSelectedGemId] = useState<string | null>(null);

  if (!gems) {
    return (
      <p className="p-6 text-center text-sm text-ui-muted">
        {t("wheel.gems.loading")}
      </p>
    );
  }
  const selectedGem =
    gems.revealed.find((gem) => gem.id === selectedGemId) ??
    gems.revealed[0] ??
    null;
  const activeSelectedGemId = selectedGem?.id ?? null;

  return (
    <div className="flex min-h-full flex-col gap-3">
      {error && (
        <p
          role="alert"
          className="rounded border border-ui-accent/25 bg-ui-accent/10 px-3 py-2 text-sm text-ui-accent-light"
        >
          {t(`wheel.gems.errors.${error}`)}
        </p>
      )}
      <div className="grid items-start gap-2 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-2">
          <GemVessels
            gems={gems}
            vocation={vocation}
            resonances={resonances}
            selectedGemId={activeSelectedGemId}
            onSelectGem={setSelectedGemId}
          />
          <GemRevealPanel
            gems={gems}
            vocation={vocation}
            pending={pending}
            onReveal={(quality) => onAction({ kind: "reveal", quality })}
          />
        </aside>
        <div className="flex min-w-0 flex-col gap-2">
          <GemDetails
            gem={selectedGem}
            gems={gems}
            vocation={vocation}
            pending={pending}
            onAction={onAction}
          />
          <GemList
            gems={gems}
            vocation={vocation}
            selectedGemId={activeSelectedGemId}
            pending={pending}
            onSelect={setSelectedGemId}
            onToggleLock={(gemId) =>
              onAction({ kind: "toggle-lock", gemId })
            }
          />
        </div>
      </div>
    </div>
  );
}
