import type { RefObject } from "react";
import type {
  ActionBar,
  ActionBotSettings,
  CreatureState,
  InventoryItem,
  Language,
  UiSettings,
} from "@tibia/protocol";
import type { GameClient } from "../../../lib/net/GameClient";
import type { WorldRenderer } from "../../../lib/render/WorldRenderer";
import type { ItemDragSource } from "../../inventory/ItemDragSource";

export interface GameWindowRuntime {
  containerRef: RefObject<HTMLDivElement | null>;
  clientRef: RefObject<GameClient | null>;
  rendererRef: RefObject<WorldRenderer | null>;
  languageRef: RefObject<Language>;
  confirmedLanguageRef: RefObject<Language>;
  joinedRef: RefObject<boolean>;
  confirmedLevelRef: RefObject<{
    readonly playerId: string;
    readonly level: number;
  } | null>;
  levelUpSequenceRef: RefObject<number>;
  resumeCharacterIdRef: RefObject<string | null>;
  pendingRuneRef: RefObject<InventoryItem | null>;
  pendingPotionRef: RefObject<InventoryItem | null>;
  pendingUseWithRef: RefObject<InventoryItem | null>;
  pendingActionBarRef: RefObject<{
    readonly slotIndex: number;
    readonly target: "creature" | "position";
    readonly awaitingResult: boolean;
  } | null>;
  itemDragRef: RefObject<ItemDragSource | null>;
  visibleCreaturesRef: RefObject<ReadonlyArray<CreatureState>>;
  uiSettingsRef: RefObject<UiSettings>;
  uiSettingsSaveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  actionBarRef: RefObject<ActionBar>;
  actionBarSaveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  actionBotSettingsRef: RefObject<ActionBotSettings>;
  marketOpenRef: RefObject<boolean>;
  marketSelectedItemRef: RefObject<number | null>;
  hadPartyRef: RefObject<boolean>;
  hadGuildRef: RefObject<boolean>;
}
