import type {
  ClientMessage,
  LookTarget,
  LookTextMessage,
} from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import type { GameClient } from "../net/GameClient";
import { performMapLook } from "../../components/game-window/controllers/performMapLook";
import { handlePlayerStateMessage } from "../../components/game-window/messages/handlePlayerStateMessage";
import { createGameWindowStore } from "../../components/game-window/store/createGameWindowStore";
import type { GameWindowStore } from "../../components/game-window/types/GameWindowStore";

function makeStore(): {
  store: GameWindowStore;
  sent: ClientMessage[];
} {
  const store = createGameWindowStore({
    accessToken: "token",
    initialLanguage: "en",
    onLogout: () => undefined,
  });
  const sent: ClientMessage[] = [];
  const client = {
    look: (target: LookTarget) => sent.push({ type: "look", target }),
  };
  store.getState().runtime.clientRef.current = client as unknown as GameClient;
  return { store, sent };
}

describe("map look", () => {
  it("sends a creature target when a creature was clicked", () => {
    const { store, sent } = makeStore();
    performMapLook(store, { x: 5, y: 6, z: 7 }, "creature-1", [431, 3_031]);
    expect(sent).toEqual([
      { type: "look", target: { kind: "creature", creatureId: "creature-1" } },
    ]);
  });

  it("sends the topmost drawn item of the clicked tile", () => {
    const { store, sent } = makeStore();
    performMapLook(store, { x: 5, y: 6, z: 7 }, null, [431, 3_031]);
    expect(sent).toEqual([
      {
        type: "look",
        target: { kind: "map", position: { x: 5, y: 6, z: 7 }, itemId: 3_031 },
      },
    ]);
  });

  it("sends a bare tile target when nothing is drawn on it", () => {
    const { store, sent } = makeStore();
    performMapLook(store, { x: 5, y: 6, z: 7 }, null, []);
    expect(sent).toEqual([
      { type: "look", target: { kind: "map", position: { x: 5, y: 6, z: 7 } } },
    ]);
  });

  it("renders the server's line in the server log and on screen", () => {
    const { store } = makeStore();
    const message: LookTextMessage = {
      type: "look-text",
      text: "You see a fire sword (Atk:24).\nIt weighs 23.00 oz.",
    };
    handlePlayerStateMessage(message, {
      store,
      client: null as never,
      renderer: null as never,
    });
    const state = store.getState();
    expect(state.combatLog.at(-1)).toBe(message.text);
    expect(state.screenMessage?.text).toBe(message.text);
    expect(state.screenMessage?.tone).toBe("look");
  });
});
