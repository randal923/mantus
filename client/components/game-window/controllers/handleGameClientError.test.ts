import type { OwnCharacterState } from "@tibia/protocol";
import { describe, expect, test } from "vitest";
import type { WorldRenderer } from "../../../lib/render/WorldRenderer";
import { createGameWindowStore } from "../store/createGameWindowStore";
import type { GameWindowStoreState } from "../types/GameWindowStoreState";
import { handleGameClientError } from "./handleGameClientError";

const OWN_ID = "11111111-1111-4111-8111-111111111111";

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
  state.setOwnCharacter({
    id: OWN_ID,
    name: "Probe",
    vocation: "Sorcerer",
    outfit: { lookType: 130, head: 0, body: 0, legs: 0, feet: 0, addons: 0 },
    lastLoginAt: null,
    position: { x: 100, y: 100, z: 7 },
    direction: "south",
    townId: 1,
  } as OwnCharacterState);
  return store;
}

function makeRenderer(): { renderer: WorldRenderer; puffs: number[] } {
  const puffs: number[] = [];
  const renderer = {
    showLocalMagicEffect: (_position: unknown, effectId: number) => {
      puffs.push(effectId);
    },
    clearMapItemPreviews: () => {},
  } as unknown as WorldRenderer;
  return { renderer, puffs };
}

describe("handleGameClientError", () => {
  test("an unmet spell requirement puffs and prints the reason as a status line", () => {
    const store = makeStore();
    const { renderer, puffs } = makeRenderer();
    handleGameClientError("spell-level-restricted", renderer, () => {}, store);
    const state = store.getState();
    expect(puffs).toEqual([3]);
    expect(state.screenMessage?.tone).toBe("status");
    expect(state.screenMessage?.text).toBe(
      "Your level is too low to cast that spell.",
    );
    expect(state.combatLog).toEqual([
      "Your level is too low to cast that spell.",
    ]);
    expect(state.serverError).toBeNull();
  });

  test("a generic refused combat action puffs and prints its reason too", () => {
    const store = makeStore();
    const { renderer, puffs } = makeRenderer();
    handleGameClientError("combat-action-failed", renderer, () => {}, store);
    const state = store.getState();
    expect(puffs).toEqual([3]);
    expect(state.screenMessage?.tone).toBe("status");
    expect(state.screenMessage?.text).toBe(
      "That combat action could not be completed.",
    );
    expect(state.combatLog).toEqual([
      "That combat action could not be completed.",
    ]);
    expect(state.serverError).toBeNull();
  });

  test("a non-gameplay error still goes to the server-error banner", () => {
    const store = makeStore();
    const { renderer, puffs } = makeRenderer();
    handleGameClientError("join-required", renderer, () => {}, store);
    const state = store.getState();
    expect(puffs).toEqual([]);
    expect(state.screenMessage).toBeNull();
    expect(state.serverError).toBe("join-required");
  });
});
