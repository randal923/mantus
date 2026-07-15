"use client";

import { CharacterPortrait } from "./CharacterPortrait";
import { HealthManaBars } from "./HealthManaBars";
import { NavigationIconButton } from "./NavigationIconButton";

type NavigationPanel = "inventory" | "quests" | "map";
type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface TopNavigationBarProps {
  characterName: string;
  level: number;
  vocation: string;
  portraitSpriteId: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  connectionStatus: ConnectionStatus;
  activePanel?: NavigationPanel;
  onCharacter?: () => void;
  onInventory?: () => void;
  onQuests?: () => void;
  onMap?: () => void;
  onSettings?: () => void;
}

export function TopNavigationBar({
  characterName,
  level,
  vocation,
  portraitSpriteId,
  health,
  maxHealth,
  mana,
  maxMana,
  activePanel,
  onCharacter,
  onInventory,
  onQuests,
  onMap,
  onSettings,
}: TopNavigationBarProps) {
  return (
    <header className="relative isolate z-40 flex min-h-20 w-full items-center gap-2 border-b border-white/10 bg-[#071014]/92 px-2 font-tibia text-ui-text shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl select-none sm:gap-5 sm:px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-r from-ui-accent/8 via-transparent to-black/20"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-ui-accent/70 via-white/10 to-transparent"
      />

      <section
        aria-label={`${characterName}'s status`}
        className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md sm:gap-3"
      >
        <CharacterPortrait
          characterName={characterName}
          level={level}
          spriteId={portraitSpriteId}
          onClick={onCharacter}
        />

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 items-baseline gap-2 px-0.5">
            <h2 className="truncate text-sm font-bold tracking-wide text-white">
              {characterName}
            </h2>
            <span className="hidden truncate text-xs text-ui-text/45 sm:block">
              {vocation}
            </span>
          </div>

          <HealthManaBars
            health={health}
            maxHealth={maxHealth}
            mana={mana}
            maxMana={maxMana}
          />
        </div>
      </section>

      <nav aria-label="Game panels" className="flex gap-2">
        <NavigationIconButton
          label="Inventory"
          active={activePanel === "inventory"}
          disabled={!onInventory}
          onClick={onInventory}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-5 sm:size-6"
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
          label="Quests"
          active={activePanel === "quests"}
          disabled={!onQuests}
          onClick={onQuests}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-5 sm:size-6"
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
          label="World map"
          active={activePanel === "map"}
          disabled={!onMap}
          onClick={onMap}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-5 sm:size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2zM9 4v14M15 6v14" />
          </svg>
        </NavigationIconButton>

        <NavigationIconButton
          label="Settings"
          disabled={!onSettings}
          onClick={onSettings}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-5 sm:size-6"
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
