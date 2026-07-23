import type { NpcDialogueMessage } from "@tibia/protocol";
import { describe, expect, it } from "vitest";
import { createGameWindowStore } from "../../components/game-window/store/createGameWindowStore";

const confirmation: NpcDialogueMessage = {
  type: "npc-dialogue",
  npcId: "npc-captain",
  npcName: "Captain",
  conversationId: "da29db8c-33a7-4935-a056-3f9dd87bafcc",
  position: { x: 10, y: 12, z: 7 },
  text: "Do you seek a passage to Carlin for 110 gold?",
  options: [
    {
      id: "boat-confirm-carlin",
      label: "Yes",
      action: "travel",
    },
  ],
  travelPrefetchPosition: { x: 32_387, y: 31_820, z: 6 },
};

describe("NPC travel pending state", () => {
  it("resets for a new dialogue response but not an unrelated close", () => {
    const store = createGameWindowStore({
      accessToken: "token",
      initialLanguage: "en",
      onLogout: () => undefined,
    });
    const state = store.getState();
    state.setNpcDialogue(confirmation);
    state.setNpcTravelPending(true);

    state.setNpcDialogue((current) => current);
    expect(store.getState().npcTravelPending).toBe(true);

    state.setNpcDialogue({
      ...confirmation,
      text: "You don't have enough money.",
    });
    expect(store.getState().npcTravelPending).toBe(false);
  });
});
