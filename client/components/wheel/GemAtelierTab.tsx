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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <GemResourceBar resources={gems.resources} />
        {error && (
          <span
            role="alert"
            className="rounded-md border border-ui-accent/25 bg-ui-accent/10 px-3 py-2 text-sm text-ui-accent-light"
          >
            {t(`wheel.gems.errors.${error}`)}
          </span>
        )}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[18rem_minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-4 lg:row-span-2 xl:row-span-1">
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
        <GemList
          gems={gems}
          vocation={vocation}
          selectedGemId={selectedGemId}
          onSelect={setSelectedGemId}
        />
        {selectedGem ? (
          <GemDetails
            gem={selectedGem}
            gems={gems}
            vocation={vocation}
            pending={pending}
            onAction={onAction}
          />
        ) : (
          <section className="ui-panel-inset overflow-hidden rounded-md border border-ui-stone-light/15">
            <header className="border-b border-ui-stone-light/15 bg-white/3 px-4 py-3">
              <h3 className="font-display text-sm tracking-wider text-ui-text-bright uppercase">
                {t("wheel.gems.selectedTitle")}
              </h3>
            </header>
            <p className="px-5 py-10 text-center text-sm leading-6 text-ui-muted">
              {t("wheel.gems.selectGem")}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
