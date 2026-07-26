"use client";

import { ProficiencyModal } from "../proficiency/ProficiencyModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameProficiencyOverlays() {
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const ownCharacter = useGameWindowStore((state) => state.ownCharacter);
  const proficiencyOpen = useGameWindowStore(
    (state) => state.proficiencyOpen,
  );
  const proficiencySession = useGameWindowStore(
    (state) => state.sessions?.proficiency ?? null,
  );
  const sessionActions = useGameWindowStore((state) => state.sessionActions);
  const setProficiencyOpen = useGameWindowStore(
    (state) => state.setProficiencyOpen,
  );
  if (!ownCharacter || !proficiencySession || !sessionActions) return null;
  if (!proficiencyOpen) return null;

  return (
    <ProficiencyModal
      proficiency={proficiencySession.state}
      pending={proficiencySession.pending}
      error={proficiencySession.error}
      onSelect={(proficiencyId, selections) => {
        const sent =
          runtime.clientRef.current?.selectProficiencyPerks(
            proficiencyId,
            selections,
          ) ?? false;
        sessionActions.proficiency.begin(sent);
      }}
      onClose={() => {
        setProficiencyOpen(false);
        sessionActions.proficiency.dismissError();
      }}
    />
  );
}
