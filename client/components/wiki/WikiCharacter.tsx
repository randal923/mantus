"use client";

import { useState } from "react";
import type {
  CyclopediaCombatStateMessage,
  CyclopediaDeathsStateMessage,
  CyclopediaItemSummaryStateMessage,
  CyclopediaPvpKillsStateMessage,
  CyclopediaView,
  OwnCharacterState,
  ProfileStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { WikiCharacterAchievements } from "./WikiCharacterAchievements";
import { WikiCharacterCombat } from "./WikiCharacterCombat";
import { WikiCharacterDeaths } from "./WikiCharacterDeaths";
import { WikiCharacterGeneral } from "./WikiCharacterGeneral";
import { WikiCharacterItems } from "./WikiCharacterItems";
import { WikiCharacterPvpKills } from "./WikiCharacterPvpKills";
import { WikiModalFrame, type WikiTab } from "./WikiModalFrame";

type WikiCharacterTab =
  | "general"
  | "combat"
  | "deaths"
  | "pvp"
  | "items"
  | "achievements";

const CHARACTER_TABS: ReadonlyArray<WikiCharacterTab> = [
  "general",
  "combat",
  "deaths",
  "pvp",
  "items",
  "achievements",
];

interface WikiCharacterProps {
  activeTab: WikiTab;
  character: OwnCharacterState;
  /** Carried weight from the inventory projection, when loaded. */
  capacityUsed: number | null;
  combat: CyclopediaCombatStateMessage | null;
  deaths: CyclopediaDeathsStateMessage | null;
  pvpKills: CyclopediaPvpKillsStateMessage | null;
  itemSummary: CyclopediaItemSummaryStateMessage | null;
  cyclopediaPending: boolean;
  cyclopediaError: string | null;
  /** Own profile projection, shared with the Profile window. */
  profile: ProfileStateMessage | null;
  onRequestCyclopedia: (view: CyclopediaView, page?: number) => void;
  onSelectTab: (tab: WikiTab) => void;
  onClose: () => void;
}

/**
 * Cyclopedia character tab: the general view renders from state the client
 * already holds; every other view is a lazily fetched server projection of
 * the own character only.
 */
export function WikiCharacter({
  activeTab,
  character,
  capacityUsed,
  combat,
  deaths,
  pvpKills,
  itemSummary,
  cyclopediaPending,
  cyclopediaError,
  profile,
  onRequestCyclopedia,
  onSelectTab,
  onClose,
}: WikiCharacterProps) {
  const { t } = useAppTranslation();
  const [tab, setTab] = useState<WikiCharacterTab>("general");
  const selectTab = (next: WikiCharacterTab) => {
    setTab(next);
    if (cyclopediaPending) return;
    // Combat stats move with every equip/imbuement change, so this tab
    // re-requests on every visit; the cached copy still renders meanwhile.
    if (next === "combat") onRequestCyclopedia("combat");
    if (next === "deaths" && !deaths) onRequestCyclopedia("deaths");
    if (next === "pvp" && !pvpKills) onRequestCyclopedia("pvp-kills");
    if (next === "items" && !itemSummary) onRequestCyclopedia("item-summary");
  };
  const pagination =
    tab === "deaths" && deaths
      ? {
          currentPage: deaths.page + 1,
          totalPages: Math.max(1, deaths.totalPages),
          disabled: cyclopediaPending,
          onPrevious: () => onRequestCyclopedia("deaths", deaths.page - 1),
          onNext: () => onRequestCyclopedia("deaths", deaths.page + 1),
        }
      : tab === "pvp" && pvpKills
        ? {
            currentPage: pvpKills.page + 1,
            totalPages: Math.max(1, pvpKills.totalPages),
            disabled: cyclopediaPending,
            onPrevious: () =>
              onRequestCyclopedia("pvp-kills", pvpKills.page - 1),
            onNext: () => onRequestCyclopedia("pvp-kills", pvpKills.page + 1),
          }
        : undefined;

  return (
    <WikiModalFrame
      activeTab={activeTab}
      pagination={pagination}
      onSelectTab={onSelectTab}
      onClose={onClose}
    >
      <>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <span className="min-w-0">
            <h3 className="truncate font-display text-sm font-bold tracking-widest text-ui-gold uppercase">
              {character.name}
            </h3>
            <p className="mt-1 text-sm text-ui-muted">
              {t("profile.levelVocation", {
                level: character.level,
                vocation: t(`vocations.${character.vocation}.name`),
              })}
            </p>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {CHARACTER_TABS.map((characterTab) => (
              <button
                key={characterTab}
                type="button"
                aria-pressed={tab === characterTab}
                onClick={() => selectTab(characterTab)}
                className={`ui-button rounded-sm border px-3 py-1.5 text-xs tracking-wide uppercase transition-colors ${
                  tab === characterTab
                    ? "ui-button-primary border-ui-accent-light/45 text-ui-text-bright"
                    : "ui-button-secondary border-ui-stone-light/15 text-ui-muted hover:border-ui-gold/40 hover:text-ui-text"
                }`}
              >
                {t(`wiki.character.tabs.${characterTab}`)}
              </button>
            ))}
          </div>
        </div>

        {tab === "general" && (
          <WikiCharacterGeneral
            character={character}
            capacityUsed={capacityUsed}
          />
        )}
        {tab === "combat" && (
          <WikiCharacterCombat combat={combat} pending={cyclopediaPending} />
        )}
        {tab === "deaths" && (
          <WikiCharacterDeaths deaths={deaths} pending={cyclopediaPending} />
        )}
        {tab === "pvp" && (
          <WikiCharacterPvpKills
            pvpKills={pvpKills}
            pending={cyclopediaPending}
          />
        )}
        {tab === "items" && (
          <WikiCharacterItems
            itemSummary={itemSummary}
            pending={cyclopediaPending}
          />
        )}
        {tab === "achievements" && (
          <WikiCharacterAchievements profile={profile} />
        )}

        {cyclopediaError && !cyclopediaPending && (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {cyclopediaError}
          </p>
        )}
      </>
    </WikiModalFrame>
  );
}
