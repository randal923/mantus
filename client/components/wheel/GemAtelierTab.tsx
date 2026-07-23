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
import { GemResourceBar } from "./GemResourceBar";
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

/** Gem Atelier: vessels, gem revelation, and the revealed gem collection. */
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
    gems.revealed.find((gem) => gem.id === selectedGemId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <GemResourceBar resources={gems.resources} />
        {error && (
          <span className="text-sm text-ui-accent-light">
            {t(`wheel.gems.errors.${error}`)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-4 lg:flex-nowrap">
        <div className="flex w-full shrink-0 flex-col gap-3 sm:w-72">
          <GemVessels
            gems={gems}
            vocation={vocation}
            resonances={resonances}
            onSelectGem={setSelectedGemId}
          />
          <GemRevealPanel
            gems={gems}
            vocation={vocation}
            pending={pending}
            onReveal={(quality) => onAction({ kind: "reveal", quality })}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <GemList
            gems={gems}
            vocation={vocation}
            selectedGemId={selectedGemId}
            onSelect={setSelectedGemId}
          />
          {selectedGem && (
            <GemDetails
              gem={selectedGem}
              gems={gems}
              vocation={vocation}
              pending={pending}
              onAction={onAction}
            />
          )}
        </div>
      </div>
    </div>
  );
}
