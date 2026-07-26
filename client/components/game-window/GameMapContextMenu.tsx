"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { performMapLook } from "./controllers/performMapLook";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameMapContextMenu() {
  const store = useGameWindowStoreApi();
  const { t } = useAppTranslation();
  const menu = useGameWindowStore((state) => state.mapContextMenu);
  const followTargetId = useGameWindowStore((state) => state.followTargetId);
  const setMapContextMenu = useGameWindowStore(
    (state) => state.setMapContextMenu,
  );

  if (!menu) return null;
  const {
    fightState,
    ownCharacter,
    visibleCreatures,
    runtime,
    sessionActions,
    setOutfitWindowOpen,
  } = store.getState();
  const client = runtime.clientRef.current;
  const creature = menu.creatureId
    ? visibleCreatures.find((candidate) => candidate.id === menu.creatureId)
    : undefined;

  const items: ContextMenuItem[] = [
    {
      id: "look",
      label: t("contextMenu.look"),
      onSelect: () => performMapLook(store, menu.creatureId, menu.itemIds),
    },
  ];
  const attackableId =
    creature && creature.kind !== "npc" && creature.id !== ownCharacter?.id
      ? creature.id
      : null;
  if (attackableId) {
    if (fightState?.attackTargetId === attackableId) {
      items.push({
        id: "stop-attack",
        label: t("contextMenu.stopAttack"),
        onSelect: () => client?.cancelAttack(),
      });
    } else {
      items.push({
        id: "attack",
        label: t("contextMenu.attack"),
        onSelect: () => client?.attackTarget(attackableId),
      });
    }
    if (followTargetId === attackableId) {
      items.push({
        id: "stop-follow",
        label: t("contextMenu.stopFollow"),
        onSelect: () => client?.cancelFollow(),
      });
    } else {
      items.push({
        id: "follow",
        label: t("contextMenu.follow"),
        onSelect: () => client?.followCreature(attackableId),
      });
    }
  }
  if (creature && creature.id === ownCharacter?.id) {
    items.push({
      id: "set-outfit",
      label: t("contextMenu.setOutfit"),
      onSelect: () => {
        const sent = client?.getOutfits() ?? false;
        sessionActions?.outfit.begin(sent);
        setOutfitWindowOpen(true);
      },
    });
  }
  if (!menu.creatureId) {
    items.push({
      id: "use",
      label: t("contextMenu.use"),
      onSelect: () => client?.useMap(menu.position),
    });
  }

  return (
    <ContextMenu
      x={menu.screen.x}
      y={menu.screen.y}
      items={items}
      onClose={() => setMapContextMenu(null)}
    />
  );
}
