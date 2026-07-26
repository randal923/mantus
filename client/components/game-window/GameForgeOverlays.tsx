"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { getInventoryItems } from "../../lib/inventory/getInventoryItems";
import { ForgeModal } from "../forge/ForgeModal";
import { ImbuementModal } from "../imbuement/ImbuementModal";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameForgeOverlays() {
  const { t } = useAppTranslation();
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const ownCharacter = useGameWindowStore((state) => state.ownCharacter);
  const forgeOpen = useGameWindowStore((state) => state.forgeOpen);
  const imbuementItemId = useGameWindowStore(
    (state) => state.imbuementItemId,
  );
  const forgeSession = useGameWindowStore(
    (state) => state.sessions?.forge ?? null,
  );
  const imbuementSession = useGameWindowStore(
    (state) => state.sessions?.imbuement ?? null,
  );
  const inventory = useGameWindowStore(
    (state) => state.sessions?.inventory ?? null,
  );
  const sessionActions = useGameWindowStore((state) => state.sessionActions);
  const setForgeOpen = useGameWindowStore((state) => state.setForgeOpen);
  const setImbuementItemId = useGameWindowStore(
    (state) => state.setImbuementItemId,
  );
  if (!ownCharacter || !forgeSession || !imbuementSession || !sessionActions) {
    return null;
  }

  const forgeError = forgeSession.error
    ? t(`forge.errors.${forgeSession.error}`, {
        defaultValue: t("forge.errors.invalid-request"),
      })
    : null;
  const imbuementError = imbuementSession.error
    ? t(`imbuement.errors.${imbuementSession.error}`, {
        defaultValue: t("imbuement.errors.invalid-request"),
      })
    : null;
  const imbuedItem =
    imbuementItemId !== null
      ? getInventoryItems(inventory).find(
          (item) => item.id === imbuementItemId,
        )
      : undefined;
  const imbuementWindow =
    imbuementItemId !== null &&
    imbuementSession.window?.itemId === imbuementItemId
      ? imbuementSession.window
      : null;

  return (
    <>
      {forgeOpen && inventory && (
        <ForgeModal
          forge={forgeSession.state}
          history={forgeSession.history}
          result={forgeSession.result}
          inventory={inventory}
          pending={forgeSession.pending}
          error={forgeError}
          onFusion={(intent) => {
            const sent =
              runtime.clientRef.current?.forgeFusion(intent) ?? false;
            sessionActions.forge.begin(sent);
          }}
          onTransfer={(intent) => {
            const sent =
              runtime.clientRef.current?.forgeTransfer(intent) ?? false;
            sessionActions.forge.begin(sent);
          }}
          onConversion={(conversion) => {
            const sent =
              runtime.clientRef.current?.forgeConversion(conversion) ?? false;
            sessionActions.forge.begin(sent);
          }}
          onRequestHistory={(page) => {
            const sent =
              runtime.clientRef.current?.requestForgeHistory(page) ?? false;
            sessionActions.forge.begin(sent);
          }}
          onDismissResult={() => sessionActions.forge.dismissResult()}
          onClose={() => {
            setForgeOpen(false);
            sessionActions.forge.dismissError();
            sessionActions.forge.dismissResult();
          }}
        />
      )}
      {imbuementItemId !== null && (
        <ImbuementModal
          window={imbuementWindow}
          itemName={imbuedItem?.name}
          itemSpriteId={imbuedItem?.spriteId}
          pending={imbuementSession.pending}
          error={imbuementError}
          onApply={(slot, imbuementId) => {
            const sent =
              runtime.clientRef.current?.applyImbuement(
                imbuementItemId,
                slot,
                imbuementId,
              ) ?? false;
            sessionActions.imbuement.begin(sent);
          }}
          onClear={(slot) => {
            const sent =
              runtime.clientRef.current?.clearImbuement(
                imbuementItemId,
                slot,
              ) ?? false;
            sessionActions.imbuement.begin(sent);
          }}
          onClose={() => {
            setImbuementItemId(null);
            sessionActions.imbuement.dismissError();
          }}
        />
      )}
    </>
  );
}
