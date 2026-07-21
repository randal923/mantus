import type { ServerMessage } from "@tibia/protocol";
import { formatChatTime } from "../../../lib/chat/formatChatTime";
import type { GameWindowMessageContext } from "../types/GameWindowMessageContext";

export function handleCommunityMessage(
  message: ServerMessage,
  { renderer, store }: GameWindowMessageContext,
): boolean {
  const state = store.getState();
  const actions = state.sessionActions;
  if (!actions) return false;

  const { runtime } = state;

  if (message.type === "party-state") {
    const hadParty = runtime.hadPartyRef.current;
    runtime.hadPartyRef.current = message.party !== null;
    if (message.party && !hadParty) state.setPartyPanelVisible(true);
    if (!message.party && hadParty) {
      state.dispatchChat({ type: "party-closed" });
    }
    actions.party.stateReceived(message);
    renderer.setPartyView(
      message.party
        ? {
            leaderId: message.party.leaderId,
            memberIds: message.party.members.map((member) => member.id),
            sharedExpActive: message.party.sharedExpActive,
          }
        : null,
    );
    return true;
  }

  if (message.type === "party-invitation") {
    actions.party.invitationReceived(message);
    return true;
  }

  if (message.type === "party-invitation-revoked") {
    actions.party.invitationRevoked(message.leaderId);
    return true;
  }

  if (message.type === "party-chat-delivered") {
    state.dispatchChat({
      type: "party",
      speakerId: message.speakerId,
      name: message.speakerName,
      body: message.text,
      time: formatChatTime(),
    });
    return true;
  }

  if (message.type === "party-action-failed") {
    actions.party.fail(message.reason);
    return true;
  }

  if (message.type === "guild-state") {
    const hadGuild = runtime.hadGuildRef.current;
    runtime.hadGuildRef.current = message.guild !== null;
    if (!message.guild && hadGuild) {
      state.dispatchChat({ type: "guild-closed" });
    }
    actions.guild.stateReceived(message);
    renderer.setGuildView(
      message.guild
        ? {
            ownGuildName: message.guild.name,
            enemyGuildNames: message.guild.wars
              .filter((war) => war.status === "active")
              .map((war) => war.enemyGuildName),
          }
        : null,
    );
    return true;
  }

  if (message.type === "guild-invitation") {
    actions.guild.invitationReceived(message);
    return true;
  }

  if (message.type === "guild-chat-delivered") {
    state.dispatchChat({
      type: "guild",
      speakerId: message.speakerId,
      name: message.speakerName,
      body: message.text,
      time: formatChatTime(),
      highlighted: message.rankLevel >= 2,
    });
    return true;
  }

  if (message.type === "guild-event") {
    state.setGuildToast({
      kind: message.kind,
      detail: message.detail ?? "",
    });
    return true;
  }

  if (message.type === "guild-action-failed") {
    actions.guild.fail(message.reason);
    return true;
  }

  if (message.type === "house-state") {
    actions.house.stateReceived(message);
    return true;
  }

  if (message.type === "house-list") {
    actions.house.listReceived(message);
    return true;
  }

  if (message.type === "house-transfer-incoming") {
    actions.house.offerReceived(message);
    return true;
  }

  if (message.type === "house-event") {
    if (message.kind === "transfer-cancelled") {
      actions.house.offerCancelledByName(message.houseName);
    }
    state.setHouseToast({
      kind: message.kind,
      houseName: message.houseName,
      detail: message.detail ?? "",
      ...(message.warningsLeft !== undefined
        ? { warningsLeft: message.warningsLeft }
        : {}),
    });
    return true;
  }

  if (message.type === "house-action-failed") {
    actions.house.fail(message.reason);
    return true;
  }

  if (message.type === "vip-state") {
    actions.vip.stateReceived(message);
    return true;
  }

  if (message.type === "vip-status-changed") {
    const entry = actions.vip.statusChanged(message);
    if (entry?.online && entry.notifyLogin) state.setVipToast(entry.name);
    return true;
  }

  if (message.type === "vip-action-failed") {
    actions.vip.fail(message.reason);
    return true;
  }

  if (message.type === "report-received") {
    state.setReportSession((current) =>
      current
        ? { ...current, pending: false, error: null, sent: true }
        : current,
    );
    return true;
  }

  if (message.type === "report-action-failed") {
    state.setReportSession((current) =>
      current
        ? { ...current, pending: false, error: message.reason }
        : current,
    );
    return true;
  }

  if (message.type === "trade-state") {
    actions.trade.stateReceived(message);
    return true;
  }

  if (message.type === "trade-closed") {
    state.setTradeToast(message.reason);
    actions.trade.reset();
    return true;
  }

  if (message.type === "trade-action-failed") {
    actions.trade.fail(message.reason);
    return true;
  }

  if (message.type === "private-chat-delivered") {
    state.dispatchChat({
      type: "private",
      direction: message.direction,
      counterpart: message.counterpart,
      body: message.text,
      time: formatChatTime(),
    });
    return true;
  }

  if (message.type === "chat-rejected") {
    state.dispatchChat({
      type: "rejected",
      reason: message.reason,
      time: formatChatTime(),
      ...(message.retryAfterMs === undefined
        ? {}
        : { retryAfterMs: message.retryAfterMs }),
    });
    return true;
  }

  return false;
}
