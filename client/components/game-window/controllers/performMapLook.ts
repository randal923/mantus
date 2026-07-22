import { getLookText } from "../../../lib/look/getLookText";
import { loadLookItemCatalog } from "../../../lib/look/loadLookItemCatalog";
import type { GameWindowStore } from "../types/GameWindowStore";

/** Resolves a looked-at creature/tile stack into a combat-log line. */
export function performMapLook(
  store: GameWindowStore,
  creatureId: string | null,
  itemIds: ReadonlyArray<number>,
): void {
  const appendLine = (text: string) => {
    store
      .getState()
      .setCombatLog((entries) => [...entries, text].slice(-6));
  };
  const state = store.getState();
  if (creatureId) {
    if (creatureId === state.ownCharacter?.id) {
      appendLine("You see yourself.");
      return;
    }
    const creature = state.runtime.visibleCreaturesRef.current.find(
      (candidate) => candidate.id === creatureId,
    );
    if (creature) {
      appendLine(`You see ${creature.name}.`);
      return;
    }
  }
  const itemId = itemIds[itemIds.length - 1];
  if (itemId === undefined) return;
  void loadLookItemCatalog()
    .then((catalog) => {
      const entry = catalog.get(itemId);
      appendLine(entry ? getLookText(entry) : "You see nothing special.");
    })
    .catch(() => appendLine("You see nothing special."));
}
