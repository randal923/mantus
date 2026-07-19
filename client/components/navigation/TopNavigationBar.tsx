"use client";

import type { CharacterOutfit, FightMode } from "@tibia/protocol";
import { FightControls } from "../combat/FightControls";
import { CharacterPortrait } from "./CharacterPortrait";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { HealthManaBars } from "./HealthManaBars";
import { NavigationIconButton } from "./NavigationIconButton";

type NavigationPanel =
  | "character"
  | "inventory"
  | "quests"
  | "guild"
  | "house"
  | "highscores"
  | "market";
type ConnectionStatus = "connecting" | "connected" | "disconnected";

const STATUS_CLASS: Record<ConnectionStatus, string> = {
  connecting: "bg-ui-gold text-ui-gold",
  connected: "bg-ui-success text-ui-success",
  disconnected: "bg-ui-accent-light text-ui-accent-light",
};

interface TopNavigationBarProps {
  characterName: string;
  level: number;
  vocation: string;
  outfit: CharacterOutfit;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  connectionStatus: ConnectionStatus;
  fightMode: FightMode | null;
  battleListVisible: boolean;
  minimapVisible: boolean;
  activePanel?: NavigationPanel;
  onCharacter?: () => void;
  onInventory?: () => void;
  onQuests?: () => void;
  onGuild?: () => void;
  onHouse?: () => void;
  onHighscores?: () => void;
  onFightModeChange: (mode: FightMode) => void;
  onBattleList: () => void;
  onMinimap: () => void;
  onMarket?: () => void;
  onSettings?: () => void;
}

export function TopNavigationBar({
  characterName,
  level,
  vocation,
  outfit,
  health,
  maxHealth,
  mana,
  maxMana,
  connectionStatus,
  fightMode,
  battleListVisible,
  minimapVisible,
  activePanel,
  onCharacter,
  onInventory,
  onQuests,
  onGuild,
  onHouse,
  onHighscores,
  onFightModeChange,
  onBattleList,
  onMinimap,
  onMarket,
  onSettings,
}: TopNavigationBarProps) {
  const { t } = useAppTranslation();
  const connectionLabel = {
    connecting: t("connection.connecting"),
    connected: t("connection.connected"),
    disconnected: t("connection.disconnected"),
  }[connectionStatus];

  return (
    <header className="relative isolate z-40 flex min-h-20 w-full items-center gap-2 border-b border-ui-gold/25 bg-ui-panel-deep/95 px-2 font-tibia text-ui-text shadow-[0_12px_40px_rgba(0,0,0,0.55),inset_0_-1px_0_rgba(0,0,0,0.8)] backdrop-blur-md select-none sm:gap-4 sm:px-4">
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

        <div className="min-w-0 flex-1">
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
            <span className="hidden max-w-28 shrink-0 truncate rounded-sm border border-ui-stone-light/15 bg-black/30 px-1.5 py-0.5 text-[9px] font-medium tracking-wider text-ui-muted uppercase sm:block">
              {vocation}
            </span>
          </div>

          <div className="mt-1 flex min-w-0 items-center gap-2 pl-3">
            {fightMode && (
              <FightControls mode={fightMode} onChange={onFightModeChange} />
            )}
            <div className="min-w-0 flex-1">
              <HealthManaBars
                health={health}
                maxHealth={maxHealth}
                mana={mana}
                maxMana={maxMana}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="hidden items-center gap-2 text-[10px] tracking-widest text-ui-muted uppercase md:flex">
        <span
          aria-hidden
          className={`size-1.5 rounded-full shadow-[0_0_8px_currentColor] ${STATUS_CLASS[connectionStatus]}`}
        />
        {connectionLabel}
      </div>

      <nav
        aria-label={t("navigation.gamePanels")}
        className="ml-auto flex gap-1 rounded-lg border border-ui-gold/10 bg-black/20 p-1"
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
