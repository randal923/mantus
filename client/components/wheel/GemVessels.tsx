"use client";

import Image from "next/image";
import {
  WHEEL_DOMAINS,
  type GemStateMessage,
  type WheelBaseVocation,
  type WheelDomain,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { gemIconStyle } from "../../lib/wheel/gemSheets";
import { GemSheetIcon } from "./GemSheetIcon";

interface GemVesselsProps {
  gems: GemStateMessage;
  vocation: WheelBaseVocation;
  resonances: Readonly<Record<WheelDomain, number>>;
  selectedGemId: string | null;
  onSelectGem: (gemId: string) => void;
}

const VESSEL_POSITIONS = [
  "top-0 left-0",
  "top-0 right-0",
  "bottom-0 left-0",
  "right-0 bottom-0",
] as const;

/** Tibia's four-corner vessel socket for the currently equipped gems. */
export function GemVessels({
  gems,
  vocation,
  resonances,
  selectedGemId,
  onSelectGem,
}: GemVesselsProps) {
  const { t } = useAppTranslation();

  return (
    <section className="ui-panel-inset overflow-hidden rounded border border-ui-stone-light/20">
      <header className="border-b border-ui-stone-light/15 bg-white/3 px-2 py-1 text-center">
        <h3 className="font-display text-xs tracking-wider text-ui-text-bright uppercase">
          {t("wheel.gems.vessels")}
        </h3>
      </header>
      <div className="flex justify-center px-3 py-4">
        <div className="relative size-[116px]">
          <Image
            src="/assets/wheel/socket-gematelier.png"
            alt=""
            aria-hidden
            width={96}
            height={96}
            className="absolute top-2.5 left-2.5 [image-rendering:pixelated]"
          />
          {WHEEL_DOMAINS.map((domain, index) => {
            const gemId = gems.equipped[domain];
            const gem = gems.revealed.find((entry) => entry.id === gemId);
            const selected = gem?.id === selectedGemId;
            const resonance = resonances[domain] ?? 0;

            return (
              <button
                key={domain}
                type="button"
                disabled={!gem}
                aria-pressed={selected}
                aria-label={`${t(`wheel.domain.${domain}`)} · ${t(
                  "wheel.gems.resonanceCount",
                  { count: resonance },
                )}`}
                title={`${t(`wheel.domain.${domain}`)} · ${t(
                  "wheel.gems.resonanceCount",
                  { count: resonance },
                )}`}
                onClick={() => gem && onSelectGem(gem.id)}
                className={`absolute flex size-11 items-center justify-center bg-[url('/assets/wheel/backdrop_skillwheel_socket_inactive.png')] bg-[length:44px_44px] bg-center bg-no-repeat [image-rendering:pixelated] ${VESSEL_POSITIONS[index]} enabled:hover:brightness-125`}
              >
                {gem && (
                  <span className="flex scale-125 items-center justify-center">
                    <GemSheetIcon
                      style={gemIconStyle(vocation, gem.domain, gem.quality)}
                    />
                  </span>
                )}
                {selected && (
                  <Image
                    src="/assets/wheel/marker_skillwheelsocket.png"
                    alt=""
                    aria-hidden
                    width={44}
                    height={44}
                    className="pointer-events-none absolute inset-0 size-11 [image-rendering:pixelated]"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
