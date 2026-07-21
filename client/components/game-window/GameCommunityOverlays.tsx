import { useAppTranslation } from "../../i18n/useAppTranslation";
import { GuildModal } from "../guild/GuildModal";
import { HouseModal } from "../house/HouseModal";
import { PartyInvitationToast } from "../party/PartyInvitationToast";
import { VipPanel } from "../social/VipPanel";
import { useGameWindowStore } from "./store/useGameWindowStore";
import { useGameWindowStoreApi } from "./store/useGameWindowStoreApi";

export function GameCommunityOverlays() {
  const { t } = useAppTranslation();
  const store = useGameWindowStoreApi();
  const runtime = store.getState().runtime;
  const ownPlayerId = useGameWindowStore(
    (state) => state.ownCharacter?.id ?? null,
  );
  const mapName = useGameWindowStore((state) => state.mapName);
  const guildModalOpen = useGameWindowStore((state) => state.guildModalOpen);
  const houseModalOpen = useGameWindowStore((state) => state.houseModalOpen);
  const partyPanelVisible = useGameWindowStore(
    (state) => state.partyPanelVisible,
  );
  const vipPanelVisible = useGameWindowStore(
    (state) => state.vipPanelVisible,
  );
  const guildSession = useGameWindowStore(
    (state) => state.sessions?.guild ?? null,
  );
  const houseSession = useGameWindowStore(
    (state) => state.sessions?.house ?? null,
  );
  const partySession = useGameWindowStore(
    (state) => state.sessions?.party ?? null,
  );
  const vipSession = useGameWindowStore(
    (state) => state.sessions?.vip ?? null,
  );
  const sessionActions = useGameWindowStore((state) => state.sessionActions);
  const setGuildModalOpen = useGameWindowStore(
    (state) => state.setGuildModalOpen,
  );
  const setHouseModalOpen = useGameWindowStore(
    (state) => state.setHouseModalOpen,
  );
  const setVipPanelVisible = useGameWindowStore(
    (state) => state.setVipPanelVisible,
  );
  if (
    !ownPlayerId ||
    !guildSession ||
    !houseSession ||
    !partySession ||
    !vipSession ||
    !sessionActions
  ) {
    return null;
  }

  return (
    <>
      {guildModalOpen && (
        <GuildModal
          session={guildSession}
          ownPlayerId={ownPlayerId}
          error={
            guildSession.error
              ? t(`guild.errors.${guildSession.error}`, {
                  defaultValue: t("guild.errors.invalid-request"),
                })
              : null
          }
          onClose={() => setGuildModalOpen(false)}
          onCreate={(name) => runtime.clientRef.current?.createGuild(name)}
          onRespondInvitation={(guildId, accept) =>
            runtime.clientRef.current?.respondToGuildInvite(guildId, accept)
          }
          onInvite={(targetName) =>
            runtime.clientRef.current?.inviteToGuild(targetName)
          }
          onRevokeInvite={(characterId) =>
            runtime.clientRef.current?.revokeGuildInvite(characterId)
          }
          onKick={(characterId) =>
            runtime.clientRef.current?.kickFromGuild(characterId)
          }
          onPromote={(characterId) =>
            runtime.clientRef.current?.promoteGuildMember(characterId)
          }
          onDemote={(characterId) =>
            runtime.clientRef.current?.demoteGuildMember(characterId)
          }
          onSetNick={(characterId, nick) =>
            runtime.clientRef.current?.setGuildNick(characterId, nick)
          }
          onSetMotd={(motd) => runtime.clientRef.current?.setGuildMotd(motd)}
          onSetRankName={(level, name) =>
            runtime.clientRef.current?.setGuildRankName(level, name)
          }
          onPassLeadership={(characterId) =>
            runtime.clientRef.current?.passGuildLeadership(characterId)
          }
          onDisband={() => runtime.clientRef.current?.disbandGuild()}
          onLeave={() => runtime.clientRef.current?.leaveGuild()}
          onDeclareWar={(targetGuildName, fragLimit) =>
            runtime.clientRef.current?.declareGuildWar(
              targetGuildName,
              fragLimit,
            )
          }
          onRespondWar={(warId, accept) =>
            runtime.clientRef.current?.respondToGuildWar(warId, accept)
          }
          onEndWar={(warId) => runtime.clientRef.current?.endGuildWar(warId)}
        />
      )}
      {houseModalOpen && (
        <HouseModal
          session={houseSession}
          error={
            houseSession.error
              ? t(`house.errors.${houseSession.error}`, {
                  defaultValue: t("house.errors.invalid-request"),
                })
              : null
          }
          onClose={() => setHouseModalOpen(false)}
          onBuy={(houseId) => runtime.clientRef.current?.buyHouse(houseId)}
          onAbandon={() => runtime.clientRef.current?.abandonHouse()}
          onOfferTransfer={(targetName, price) =>
            runtime.clientRef.current?.offerHouseTransfer(targetName, price)
          }
          onRespondOffer={(houseId, accept) => {
            runtime.clientRef.current?.respondToHouseTransfer(houseId, accept);
            sessionActions.house.offerResolved(houseId);
          }}
          onCancelTransfer={() =>
            runtime.clientRef.current?.cancelHouseTransfer()
          }
          onSetAccess={(kind, targetName, grant) =>
            runtime.clientRef.current?.setHouseAccess(kind, targetName, grant)
          }
          onKick={(targetCharacterId) =>
            runtime.clientRef.current?.kickFromHouse(targetCharacterId)
          }
          onBrowse={(townId, page) =>
            runtime.clientRef.current?.browseHouses(townId, page)
          }
          onOpenHouse={(houseId) =>
            runtime.clientRef.current?.openHouse(houseId)
          }
          mapName={mapName}
        />
      )}
      {partySession.invitation && (
        <div className="absolute top-40 left-1/2 z-40 -translate-x-1/2">
          <PartyInvitationToast
            leaderName={partySession.invitation.leaderName}
            onAccept={() => {
              const invitation = partySession.invitation;
              if (!invitation) return;
              runtime.clientRef.current?.respondToPartyInvite(
                invitation.leaderId,
                true,
              );
              sessionActions.party.invitationRevoked(invitation.leaderId);
            }}
            onDecline={() => {
              const invitation = partySession.invitation;
              if (!invitation) return;
              runtime.clientRef.current?.respondToPartyInvite(
                invitation.leaderId,
                false,
              );
              sessionActions.party.invitationRevoked(invitation.leaderId);
            }}
          />
        </div>
      )}
      {vipPanelVisible && (
        <div
          className={`absolute top-40 z-30 ${
            partyPanelVisible ? "left-72" : "left-4"
          }`}
        >
          <VipPanel
            entries={vipSession.entries}
            error={
              vipSession.error
                ? t(`vip.errors.${vipSession.error}`, {
                    defaultValue: t("vip.errors.invalid-request"),
                  })
                : null
            }
            onAdd={(name) => runtime.clientRef.current?.addVip(name)}
            onEdit={(targetCharacterId, edits) =>
              runtime.clientRef.current?.editVip(targetCharacterId, edits)
            }
            onRemove={(targetCharacterId) =>
              runtime.clientRef.current?.removeVip(targetCharacterId)
            }
            onClose={() => setVipPanelVisible(false)}
          />
        </div>
      )}
    </>
  );
}
