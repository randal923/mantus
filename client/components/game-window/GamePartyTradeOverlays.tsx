import { useAppTranslation } from "../../i18n/useAppTranslation";
import { PartyPanel } from "../party/PartyPanel";
import { TradePanel } from "../trade/TradePanel";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GamePartyTradeOverlays() {
  const { t } = useAppTranslation();
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const ownPlayerId = useGameWindowStore(
    (state) => state.ownCharacter?.id ?? null,
  );
  const partyPanelVisible = useGameWindowStore(
    (state) => state.partyPanelVisible,
  );
  const partySession = useGameWindowStore(
    (state) => state.sessions?.party ?? null,
  );
  const tradeSession = useGameWindowStore(
    (state) => state.sessions?.trade ?? null,
  );
  const sessionActions = useGameWindowStore((state) => state.sessionActions);
  const setPartyPanelVisible = useGameWindowStore(
    (state) => state.setPartyPanelVisible,
  );
  if (!ownPlayerId || !partySession || !sessionActions) return null;

  return (
    <>
      {partyPanelVisible && (
        <div className="absolute top-24 bottom-4 left-4 z-30">
          <PartyPanel
            party={partySession.party}
            ownPlayerId={ownPlayerId}
            error={
              partySession.error
                ? t(`party.errors.${partySession.error}`, {
                    defaultValue: t("party.errors.invalid-target"),
                  })
                : null
            }
            onInvite={(targetName) =>
              runtime.clientRef.current?.inviteToParty(targetName)
            }
            onRevokeInvite={(targetPlayerId) =>
              runtime.clientRef.current?.revokePartyInvite(targetPlayerId)
            }
            onKick={(targetPlayerId) =>
              runtime.clientRef.current?.kickFromParty(targetPlayerId)
            }
            onPassLeadership={(targetPlayerId) =>
              runtime.clientRef.current?.passPartyLeadership(targetPlayerId)
            }
            onSetSharedExp={(enabled) =>
              runtime.clientRef.current?.setPartySharedExp(enabled)
            }
            onLeave={() => runtime.clientRef.current?.leaveParty()}
            onClose={() => setPartyPanelVisible(false)}
          />
        </div>
      )}
      {tradeSession && (
        <TradePanel
          session={tradeSession}
          error={
            tradeSession.error
              ? t(`trade.errors.${tradeSession.error}`, {
                  defaultValue: t("trade.errors.failed"),
                })
              : null
          }
          onAccept={() => {
            const sent = runtime.clientRef.current?.acceptTrade() ?? false;
            sessionActions.trade.begin(sent);
          }}
          onCancel={() => {
            runtime.clientRef.current?.cancelTrade();
          }}
        />
      )}
    </>
  );
}
