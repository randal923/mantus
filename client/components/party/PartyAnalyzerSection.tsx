"use client";

import type { PartyAnalyzerMessage, PartyAnalyzerPriceMode } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";

interface PartyAnalyzerSectionProps {
  analyzer: PartyAnalyzerMessage;
  isLeader: boolean;
  onReset: () => void;
  onSetPriceMode: (mode: PartyAnalyzerPriceMode) => void;
}

const PRICE_MODES: ReadonlyArray<PartyAnalyzerPriceMode> = ["npc", "market"];

const formatDuration = (elapsedMs: number): string => {
  const totalMinutes = Math.floor(elapsedMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

/**
 * Renders the server's hunt-session projection. Reset and price mode are
 * leader-only intents; the server re-checks leadership and recomputes every
 * total itself.
 */
export function PartyAnalyzerSection({
  analyzer,
  isLeader,
  onReset,
  onSetPriceMode,
}: PartyAnalyzerSectionProps) {
  const { t } = useAppTranslation();

  return (
    <section className="mt-5 rounded-xl border border-ui-gold/15 bg-black/20 p-3">
      <div className="flex items-center gap-3">
        <h3 className="min-w-0 flex-1 font-display text-sm tracking-[0.15em] text-ui-gold uppercase">
          {t("party.analyzer.title")}
        </h3>
        <span className="text-sm tabular-nums text-ui-muted">
          {formatDuration(analyzer.elapsedMs)}
        </span>
      </div>

      {isLeader && (
        <div className="mt-3 flex items-center gap-2">
          {PRICE_MODES.map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant={analyzer.priceMode === mode ? "primary" : "secondary"}
              onClick={() => onSetPriceMode(mode)}
            >
              {t(`party.analyzer.priceMode.${mode}`)}
            </Button>
          ))}
          <Button size="sm" className="ml-auto" onClick={onReset}>
            {t("party.analyzer.reset")}
          </Button>
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-sm">
          <thead>
            <tr className="text-left text-ui-muted">
              <th scope="col" className="pb-1 font-normal">
                {t("party.analyzer.member")}
              </th>
              <th scope="col" className="pb-1 text-right font-normal">
                {t("party.analyzer.loot")}
              </th>
              <th scope="col" className="pb-1 text-right font-normal">
                {t("party.analyzer.supplies")}
              </th>
              <th scope="col" className="pb-1 text-right font-normal">
                {t("party.analyzer.balance")}
              </th>
              <th scope="col" className="pb-1 text-right font-normal">
                {t("party.analyzer.damage")}
              </th>
              <th scope="col" className="pb-1 text-right font-normal">
                {t("party.analyzer.healing")}
              </th>
            </tr>
          </thead>
          <tbody>
            {analyzer.entries.map((entry) => (
              <tr key={entry.playerId} className="border-t border-ui-gold/10">
                <td className="max-w-24 truncate py-1 text-ui-text">
                  {entry.name}
                </td>
                <td className="py-1 text-right tabular-nums text-ui-text">
                  {entry.lootValue}
                </td>
                <td className="py-1 text-right tabular-nums text-ui-text">
                  {entry.supplyValue}
                </td>
                <td
                  className={`py-1 text-right tabular-nums ${
                    entry.balance < 0 ? "text-red-300" : "text-emerald-400"
                  }`}
                >
                  {entry.balance}
                </td>
                <td className="py-1 text-right tabular-nums text-ui-text">
                  {entry.damageDealt}
                </td>
                <td className="py-1 text-right tabular-nums text-ui-text">
                  {entry.healingDone}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
