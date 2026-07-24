"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { BattleList } from "../creatures/BattleList";
import { useGameWindowStore } from "./store/useGameWindowStore";

export function GameBattleListOverlay() {
  const { t } = useAppTranslation();
  const visibleCreatures = useGameWindowStore(
    (state) => state.visibleCreatures,
  );
  const ownPlayerId = useGameWindowStore(
    (state) => state.ownCharacter?.id ?? null,
  );
  const attackTargetId = useGameWindowStore(
    (state) => state.fightState?.attackTargetId ?? null,
  );
  if (!ownPlayerId) return null;

  return (
    <BattleList
      title={t("hud.battleList")}
      creatures={visibleCreatures}
      ownPlayerId={ownPlayerId}
      attackTargetId={attackTargetId}
    />
  );
}
