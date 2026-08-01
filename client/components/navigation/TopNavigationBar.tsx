"use client";

import type { CharacterOutfit, FightMode } from "@tibia/protocol";
import { FightControls } from "../combat/FightControls";
import { CharacterPortrait } from "./CharacterPortrait";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { NavigationIconButton } from "./NavigationIconButton";
import { CurrencyCounters } from "./CurrencyCounters";

type NavigationPanel =
  | "character"
  | "inventory"
  | "quests"
  | "guild"
  | "house"
  | "highscores"
  | "wiki"
  | "wheel"
  | "forge"
  | "proficiency"
  | "prey"
  | "huntingTasks"
  | "huntFinder"
  | "outfit"
  | "profile"
  | "market";

interface TopNavigationBarProps {
  characterName: string;
  level: number;
  vocation: string;
  outfit: CharacterOutfit;
  fightMode: FightMode | null;
  battleListVisible: boolean;
  minimapVisible: boolean;
  trackerVisible: boolean;
  vipVisible: boolean;
  partyVisible: boolean;
  gold: number;
  bankBalance: number;
  mantusCoins: number;
  storeOpen: boolean;
  activePanel?: NavigationPanel;
  onCharacter?: () => void;
  onInventory?: () => void;
  onVip?: () => void;
  onParty?: () => void;
  onQuests?: () => void;
  onGuild?: () => void;
  onHouse?: () => void;
  onHighscores?: () => void;
  onWiki?: () => void;
  onWheel?: () => void;
  onForge?: () => void;
  onProficiency?: () => void;
  onPrey?: () => void;
  onHuntingTasks?: () => void;
  onHuntFinder?: () => void;
  onOutfits?: () => void;
  onProfile?: () => void;
  onFightModeChange: (mode: FightMode) => void;
  onBattleList: () => void;
  onMinimap: () => void;
  onTracker?: () => void;
  onStore: () => void;
  onMarket?: () => void;
  onSettings?: () => void;
}

export function TopNavigationBar({
  characterName,
  level,
  vocation,
  outfit,
  fightMode,
  battleListVisible,
  minimapVisible,
  trackerVisible,
  vipVisible,
  partyVisible,
  gold,
  bankBalance,
  mantusCoins,
  storeOpen,
  activePanel,
  onCharacter,
  onInventory,
  onVip,
  onParty,
  onQuests,
  onGuild,
  onHouse,
  onHighscores,
  onWiki,
  onWheel,
  onForge,
  onProficiency,
  onPrey,
  onHuntingTasks,
  onHuntFinder,
  onOutfits,
  onProfile,
  onFightModeChange,
  onBattleList,
  onMinimap,
  onTracker,
  onStore,
  onMarket,
  onSettings,
}: TopNavigationBarProps) {
  const { t } = useAppTranslation();

  return (
    <header className="relative isolate z-40 flex min-h-16 w-full items-center gap-2 border-b border-ui-gold/25 bg-ui-panel-deep/95 px-2 font-tibia text-ui-text shadow-[0_12px_40px_rgba(0,0,0,0.55),inset_0_-1px_0_rgba(0,0,0,0.8)] backdrop-blur-md select-none sm:gap-4 sm:px-4">
      <div
        aria-hidden
        className="texture-noise pointer-events-none absolute inset-0 -z-10 opacity-[0.035] mix-blend-soft-light"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-ui-gold/55 to-transparent"
      />

      <section
        aria-label={t("character.status", { name: characterName })}
        className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md sm:gap-3"
      >
        <CharacterPortrait
          characterName={characterName}
          level={level}
          outfit={outfit}
          onClick={onCharacter}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2 px-0.5">
            <span
              aria-hidden
              className="h-3 w-0.5 shrink-0 rounded-full bg-ui-accent-light/80"
            />
            <h2
              title={characterName}
              className="truncate font-display text-sm font-bold tracking-wide text-ui-text-bright uppercase sm:text-base"
            >
              {characterName}
            </h2>
            <span className="hidden max-w-28 shrink-0 truncate rounded-sm border border-ui-stone-light/15 bg-black/30 px-1.5 py-0.5 text-xs font-medium tracking-wider text-ui-muted uppercase sm:block">
              {vocation}
            </span>
          </div>

          {fightMode && (
            <div className="pl-3">
              <FightControls mode={fightMode} onChange={onFightModeChange} />
            </div>
          )}
        </div>
      </section>

      <CurrencyCounters
        gold={gold}
        bankBalance={bankBalance}
        mantusCoins={mantusCoins}
        storeOpen={storeOpen}
        onStore={onStore}
      />

      <nav
        aria-label={t("navigation.gamePanels")}
        className="flex gap-1 rounded-lg border border-ui-gold/10 bg-black/20 p-1"
      >
        <NavigationIconButton
          label={t("navigation.character")}
          hotkey="C"
          active={activePanel === "character"}
          disabled={!onCharacter}
          onClick={onCharacter}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5.5 20a6.5 6.5 0 0 1 13 0M4 4.5h3M17 4.5h3" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.inventory")}
          hotkey="I"
          active={activePanel === "inventory"}
          disabled={!onInventory}
          onClick={onInventory}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          >
            <path d="M5 8.5h14v11H5z" />
            <path d="M8.5 8.5V6.7A3.3 3.3 0 0 1 12 3.5a3.3 3.3 0 0 1 3.5 3.2v1.8M9 12h6" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.vip")}
          hotkey="V"
          active={vipVisible}
          disabled={!onVip}
          onClick={onVip}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="8" r="3.5" />
            <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
            <path d="m18 5 .9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.party")}
          hotkey="P"
          active={partyVisible}
          disabled={!onParty}
          onClick={onParty}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="8" r="3" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M2.5 20a5.5 5.5 0 0 1 11 0M13 19.5a4.5 4.5 0 0 1 8.5 0" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.quests")}
          active={activePanel === "quests"}
          disabled={!onQuests}
          onClick={onQuests}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 4.5h10.5A1.5 1.5 0 0 1 18 6v14H7.5A1.5 1.5 0 0 1 6 18.5z" />
            <path d="M6 18.5A1.5 1.5 0 0 1 7.5 17H18M9 8h6M9 11h4" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.guild")}
          hotkey="G"
          active={activePanel === "guild"}
          disabled={!onGuild}
          onClick={onGuild}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 3.5v17M6 4.5h11.5l-2.5 3.5 2.5 3.5H6" />
            <path d="M4 20.5h4" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.house")}
          hotkey="H"
          active={activePanel === "house"}
          disabled={!onHouse}
          onClick={onHouse}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 11.5 12 4.5l8 7" />
            <path d="M6.5 10v9.5h11V10" />
            <path d="M10.5 19.5v-5h3v5" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.highscores")}
          active={activePanel === "highscores"}
          disabled={!onHighscores}
          onClick={onHighscores}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
            <path d="M8 5.5H5.5A3.5 3.5 0 0 0 9 9M16 5.5h2.5A3.5 3.5 0 0 1 15 9" />
            <path d="M12 13v3.5M9 20.5h6M10 16.5h4v4h-4z" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.wiki")}
          active={activePanel === "wiki"}
          disabled={!onWiki}
          onClick={onWiki}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 4.5h5.5A3.5 3.5 0 0 1 14 8v11.5H8.5A3.5 3.5 0 0 0 5 23z" />
            <path d="M19 4.5h-5.5A3.5 3.5 0 0 0 10 8v11.5h5.5A3.5 3.5 0 0 1 19 23zM8 9h3M13 9h3M8 12h3M13 12h3" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.wheel")}
          active={activePanel === "wheel"}
          disabled={!onWheel}
          onClick={onWheel}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="8.5" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5M6 6l3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.forge")}
          active={activePanel === "forge"}
          disabled={!onForge}
          onClick={onForge}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 9.5h9.5v3.5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
            <path d="M13.5 10.5 20 5.5l-1.5 5h-5" />
            <path d="M6.5 17v3.5M11 17v3.5M4.5 20.5h9" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.proficiency")}
          active={activePanel === "proficiency"}
          disabled={!onProficiency}
          onClick={onProficiency}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m5 19 8.5-8.5" />
            <path d="M13 4.5 19.5 4l-.5 6.5L9.5 20 4 14.5z" />
            <path d="M16 8.5 18.5 6" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.prey")}
          active={activePanel === "prey"}
          disabled={!onPrey}
          onClick={onPrey}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="6" cy="9.5" r="1.8" />
            <circle cx="12" cy="7" r="1.8" />
            <circle cx="18" cy="9.5" r="1.8" />
            <path d="M12 12c2.9 0 5.2 2.3 5.2 4.8 0 1.5-1.1 2.7-2.6 2.7-1 0-1.7-.6-2.6-.6s-1.6.6-2.6.6c-1.5 0-2.6-1.2-2.6-2.7 0-2.5 2.3-4.8 5.2-4.8z" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.huntingTasks")}
          active={activePanel === "huntingTasks"}
          disabled={!onHuntingTasks}
          onClick={onHuntingTasks}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.5 4.5h5V7h-5z" />
            <path d="M9.5 5.5H6.5v15h11v-15h-3" />
            <path d="m9 13.5 2 2 4-4.5" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.huntFinder")}
          active={activePanel === "huntFinder"}
          disabled={!onHuntFinder}
          onClick={onHuntFinder}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9z" />
            <path d="M12 1.5v2M12 20.5v2M1.5 12h2M20.5 12h2" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.outfit")}
          active={activePanel === "outfit"}
          disabled={!onOutfits}
          onClick={onOutfits}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 4.5 5 7l1.5 3.5L8 9.5V20h8V9.5l1.5 1L19 7l-4-2.5a3 3 0 0 1-6 0z" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.profile")}
          active={activePanel === "profile"}
          disabled={!onProfile}
          onClick={onProfile}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="9" r="4.5" />
            <path d="m9.5 12.8-2 7.2 4.5-2.5 4.5 2.5-2-7.2" />
            <path d="M12 7v2.5l1.5 1" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.battleList")}
          active={battleListVisible}
          onClick={onBattleList}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="5.5" cy="6.5" r="1.5" />
            <circle cx="5.5" cy="12" r="1.5" />
            <circle cx="5.5" cy="17.5" r="1.5" />
            <path d="M9.5 6.5H20M9.5 12H20M9.5 17.5H20" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.tracker")}
          active={trackerVisible}
          disabled={!onTracker}
          onClick={onTracker}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="6.5" />
            <circle cx="12" cy="12" r="1.5" />
            <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.map")}
          active={minimapVisible}
          onClick={onMinimap}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 4.5 4 6.5v13l5-2 6 2 5-2v-13l-5 2z" />
            <path d="M9 4.5v13M15 6.5v13" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.market")}
          active={activePanel === "market"}
          disabled={!onMarket}
          onClick={onMarket}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 9.5 5.5 4h13L20 9.5" />
            <path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0" />
            <path d="M5.5 12.5V20h13v-7.5M9.5 20v-4.5h5V20" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label={t("navigation.settings")}
          hotkey="Esc"
          disabled={!onSettings}
          onClick={onSettings}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-4 sm:size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
          </svg>
        </NavigationIconButton>
      </nav>
    </header>
  );
}
