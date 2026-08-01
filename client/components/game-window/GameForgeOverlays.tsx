"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";
import { itemImbuementSlotCountOf } from "../../lib/forge/itemImbuementSlotCountOf";
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
  const imbuementOpen = useGameWindowStore((state) => state.imbuementOpen);
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
  const setImbuementOpen = useGameWindowStore(
    (state) => state.setImbuementOpen,
  );
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
  const carried = getInventoryItems(inventory);
  const imbuementWindow = imbuementSession.window;

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
      {imbuementOpen && (
        <ImbuementModal
          window={imbuementWindow}
          imbuableItems={carried.filter(
            (item) => itemImbuementSlotCountOf(item) > 0,
          )}
          spriteIdOf={(itemTypeId) =>
            carried.find((item) => item.typeId === itemTypeId)?.spriteId
          }
          pending={imbuementSession.pending}
          error={imbuementError}
          onPickItem={(itemId) => {
            const sent =
              runtime.clientRef.current?.requestImbuementWindow(itemId) ??
              false;
            sessionActions.imbuement.begin(sent);
          }}
          onSelectMode={(mode) => {
            const itemId = mode === "scroll" ? null : imbuementItemId;
            const sent =
              runtime.clientRef.current?.requestImbuementWindow(
                itemId,
                mode,
              ) ?? false;
            sessionActions.imbuement.begin(sent);
          }}
          onApply={(slot, imbuementId) => {
            if (imbuementItemId === null) return;
            const sent =
              runtime.clientRef.current?.applyImbuement(
                imbuementItemId,
                slot,
                imbuementId,
              ) ?? false;
            sessionActions.imbuement.begin(sent);
          }}
          onClear={(slot) => {
            if (imbuementItemId === null) return;
            const sent =
              runtime.clientRef.current?.clearImbuement(
                imbuementItemId,
                slot,
              ) ?? false;
            sessionActions.imbuement.begin(sent);
          }}
          onForgeScroll={(imbuementId) => {
            const sent =
              runtime.clientRef.current?.forgeImbuementScroll(imbuementId) ??
              false;
            sessionActions.imbuement.begin(sent);
          }}
          onClose={() => {
            setImbuementOpen(false);
            setImbuementItemId(null);
            sessionActions.imbuement.reset();
          }}
        />
      )}
    </>
  );
}
