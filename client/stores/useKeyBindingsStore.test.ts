import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_KEY_BINDINGS } from "../lib/hotkeys/keyBindings";
import { useKeyBindingsStore } from "./useKeyBindingsStore";

describe("useKeyBindingsStore", () => {
  beforeEach(() => {
    useKeyBindingsStore.setState({ bindings: DEFAULT_KEY_BINDINGS });
  });

  it("assigns and clears bindings", () => {
    useKeyBindingsStore.getState().setBinding("toggleQuestLog", "KeyQ");
    expect(useKeyBindingsStore.getState().bindings.toggleQuestLog).toBe(
      "KeyQ",
    );
    useKeyBindingsStore.getState().setBinding("toggleQuestLog", null);
    expect(useKeyBindingsStore.getState().bindings.toggleQuestLog).toBeNull();
  });

  it("steals a key from its previous owner so one key drives one action", () => {
    useKeyBindingsStore.getState().setBinding("toggleQuestLog", "KeyI");
    const bindings = useKeyBindingsStore.getState().bindings;
    expect(bindings.toggleQuestLog).toBe("KeyI");
    expect(bindings.toggleInventory).toBeNull();
  });

  it("clearing a binding does not disturb other actions", () => {
    useKeyBindingsStore.getState().setBinding("toggleInventory", null);
    const bindings = useKeyBindingsStore.getState().bindings;
    expect(bindings.toggleInventory).toBeNull();
    expect(bindings.toggleCharacterStats).toBe("KeyC");
  });

  it("restores every default on reset", () => {
    useKeyBindingsStore.getState().setBinding("moveUp", "KeyT");
    useKeyBindingsStore.getState().setBinding("toggleWiki", "KeyW");
    useKeyBindingsStore.getState().resetBindings();
    expect(useKeyBindingsStore.getState().bindings).toEqual(
      DEFAULT_KEY_BINDINGS,
    );
  });
});
