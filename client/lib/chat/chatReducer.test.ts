import { describe, expect, it } from "vitest";
import {
  chatReducer,
  initialChatState,
  LOCAL_CHANNEL_ID,
  privateChannelId,
  type ChatAction,
  type ChatState,
} from "./chatReducer";

const joinedState = (): ChatState =>
  chatReducer(initialChatState, {
    type: "reset",
    ownPlayerId: "player-1",
    ownName: "Hero",
  });

const run = (state: ChatState, ...actions: ChatAction[]): ChatState =>
  actions.reduce(chatReducer, state);

describe("chatReducer", () => {
  it("appends local speech and flags own lines by player id", () => {
    const state = run(joinedState(), {
      type: "spoke",
      creatureId: "player-1",
      name: "Hero",
      mode: "say",
      body: "hello",
      time: "18:00",
    });

    const local = state.channels.find(
      (channel) => channel.id === LOCAL_CHANNEL_ID,
    );
    expect(local?.entries).toEqual([
      {
        id: 1,
        kind: "speech",
        sender: "Hero",
        body: "hello",
        time: "18:00",
        isOwn: true,
      },
    ]);
    expect(local?.unreadCount).toBe(0);
  });

  it("creates a private channel per counterpart and echoes with own name", () => {
    const state = run(
      joinedState(),
      {
        type: "private",
        direction: "incoming",
        counterpart: "Aria",
        body: "psst",
        time: "18:00",
      },
      {
        type: "private",
        direction: "outgoing",
        counterpart: "Aria",
        body: "hi back",
        time: "18:01",
      },
    );

    const channel = state.channels.find(
      (candidate) => candidate.id === privateChannelId("Aria"),
    );
    expect(channel?.kind).toBe("whisper");
    expect(channel?.counterpart).toBe("Aria");
    expect(channel?.unreadCount).toBe(2);
    expect(channel?.entries.map((entry) =>
      entry.kind === "speech" ? entry.sender : entry.kind,
    )).toEqual(["Aria", "Hero"]);
  });

  it("clears unread when the channel is selected", () => {
    const state = run(
      joinedState(),
      {
        type: "private",
        direction: "incoming",
        counterpart: "Aria",
        body: "psst",
        time: "18:00",
      },
      { type: "select", channelId: privateChannelId("Aria") },
    );

    const channel = state.channels.find(
      (candidate) => candidate.id === privateChannelId("Aria"),
    );
    expect(state.activeChannelId).toBe(privateChannelId("Aria"));
    expect(channel?.unreadCount).toBe(0);
  });

  it("closes private channels but keeps the local channel", () => {
    const privateState = run(joinedState(), {
      type: "open-private",
      counterpart: "Aria",
    });
    const closedState = run(
      privateState,
      { type: "close", channelId: privateChannelId("Aria") },
      { type: "close", channelId: LOCAL_CHANNEL_ID },
    );

    expect(closedState.activeChannelId).toBe(LOCAL_CHANNEL_ID);
    expect(closedState.channels).toEqual([
      expect.objectContaining({ id: LOCAL_CHANNEL_ID }),
    ]);
  });

  it("routes rejection notices to the active channel without unread", () => {
    const state = run(joinedState(), {
      type: "rejected",
      reason: "muted",
      retryAfterMs: 5_000,
      time: "18:00",
    });

    const local = state.channels.find(
      (channel) => channel.id === LOCAL_CHANNEL_ID,
    );
    expect(local?.entries).toEqual([
      {
        id: 1,
        kind: "notice",
        reason: "muted",
        retryAfterMs: 5_000,
        time: "18:00",
      },
    ]);
    expect(local?.unreadCount).toBe(0);
  });

  it("bounds local history", () => {
    let state = joinedState();
    for (let index = 0; index < 250; index++) {
      state = chatReducer(state, {
        type: "spoke",
        creatureId: "someone",
        name: "Someone",
        mode: "say",
        body: `line ${index}`,
        time: "18:00",
      });
    }

    const local = state.channels.find(
      (channel) => channel.id === LOCAL_CHANNEL_ID,
    );
    expect(local?.entries).toHaveLength(200);
    expect(local?.entries.at(-1)).toMatchObject({ body: "line 249" });
  });

  it("opens and selects a private channel from a sender click", () => {
    const state = run(joinedState(), {
      type: "open-private",
      counterpart: "Aria",
    });

    expect(state.activeChannelId).toBe(privateChannelId("Aria"));
    expect(
      state.channels.some(
        (channel) => channel.id === privateChannelId("Aria"),
      ),
    ).toBe(true);
  });
});
