import type {
  OwnCharacterState,
  ServerMessage,
} from "@tibia/protocol";
import { describe, expect, test } from "vitest";
import type { GameWindowMessageContext } from "../types/GameWindowMessageContext";
import type { GameWindowStoreState } from "../types/GameWindowStoreState";
import { createGameWindowStore } from "../store/createGameWindowStore";
import { handlePlayerStateMessage } from "./handlePlayerStateMessage";

const OWN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function makeOwnCharacter(): OwnCharacterState {
  return {
    id: OWN_ID,
    name: "Probe",
    vocation: "Sorcerer",
    outfit: { lookType: 130, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
    lastLoginAt: null,
    position: { x: 100, y: 100, z: 7 },
    direction: "south",
    townId: 1,
  } as OwnCharacterState;
}

function makeStore() {
  const store = createGameWindowStore({
    accessToken: "token",
    initialLanguage: "en",
    onLogout: () => {},
  });
  const state = store.getState();
  state.bindSessions(
    {} as never,
    {} as GameWindowStoreState["sessionActions"] & object,
  );
  state.setOwnCharacter(makeOwnCharacter());
  return store;
}

function dispatch(
  store: ReturnType<typeof makeStore>,
  message: ServerMessage,
): { handled: boolean; notifications: number } {
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });
  const handled = handlePlayerStateMessage(message, {
    store,
  } as GameWindowMessageContext);
  unsubscribe();
  return { handled, notifications };
}

describe("creature-moved", () => {
  test("own player's move updates position and direction", () => {
    const store = makeStore();
    const { handled } = dispatch(store, {
      type: "creature-moved",
      creatureId: OWN_ID,
      from: { x: 100, y: 100, z: 7 },
      position: { x: 101, y: 100, z: 7 },
      direction: "east",
      positionRevision: 2,
      durationMs: 200,
    });
    expect(handled).toBe(false);
    expect(store.getState().ownCharacter?.position).toEqual({
      x: 101,
      y: 100,
      z: 7,
    });
    expect(store.getState().ownCharacter?.direction).toBe("east");
  });

  test("another creature's move leaves own character untouched and does not notify", () => {
    const store = makeStore();
    const before = store.getState().ownCharacter;
    const { handled, notifications } = dispatch(store, {
      type: "creature-moved",
      creatureId: OTHER_ID,
      from: { x: 50, y: 50, z: 7 },
      position: { x: 51, y: 50, z: 7 },
      direction: "east",
      positionRevision: 5,
      durationMs: 200,
    });
    expect(handled).toBe(false);
    expect(store.getState().ownCharacter).toBe(before);
    expect(notifications).toBe(0);
  });
});

describe("position-correction", () => {
  test("own correction snaps position", () => {
    const store = makeStore();
    dispatch(store, {
      type: "position-correction",
      playerId: OWN_ID,
      position: { x: 99, y: 100, z: 7 },
      direction: "west",
      positionRevision: 3,
      retryAfterMs: 100,
      reason: "blocked",
    });
    expect(store.getState().ownCharacter?.position).toEqual({
      x: 99,
      y: 100,
      z: 7,
    });
    expect(store.getState().ownCharacter?.direction).toBe("west");
  });

  test("another player's correction does not notify", () => {
    const store = makeStore();
    const before = store.getState().ownCharacter;
    const { notifications } = dispatch(store, {
      type: "position-correction",
      playerId: OTHER_ID,
      position: { x: 10, y: 10, z: 7 },
      direction: "north",
      positionRevision: 1,
      retryAfterMs: 100,
      reason: "blocked",
    });
    expect(store.getState().ownCharacter).toBe(before);
    expect(notifications).toBe(0);
  });
});

describe("creature-state-changed", () => {
  test("own outfit change reaches the portrait copy", () => {
    const store = makeStore();
    const { handled } = dispatch(store, {
      type: "creature-state-changed",
      creature: {
        id: OWN_ID,
        kind: "player",
        name: "Probe",
        position: { x: 100, y: 100, z: 7 },
        positionRevision: 1,
        direction: "south",
        healthPercent: 100,
        outfit: { lookType: 131, head: 1, body: 2, legs: 3, feet: 4, addons: 1 },
      },
    } as ServerMessage);
    expect(handled).toBe(false);
    expect(store.getState().ownCharacter?.outfit).toEqual({
      lookType: 131,
      head: 1,
      body: 2,
      legs: 3,
      feet: 4,
      addons: 1,
    });
  });

  test("a monster's state change does not notify", () => {
    const store = makeStore();
    const before = store.getState().ownCharacter;
    const { notifications } = dispatch(store, {
      type: "creature-state-changed",
      creature: {
        id: OTHER_ID,
        kind: "monster",
        name: "Butterfly",
        position: { x: 50, y: 50, z: 7 },
        positionRevision: 1,
        direction: "south",
        healthPercent: 100,
        outfit: { lookType: 213, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
      },
    } as ServerMessage);
    expect(store.getState().ownCharacter).toBe(before);
    expect(notifications).toBe(0);
  });
});
