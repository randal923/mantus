import { describe, expect, test } from "vitest";
import { createGameWindowStore } from "./createGameWindowStore";

function makeStore() {
  return createGameWindowStore({
    accessToken: "token",
    initialLanguage: "en",
    onLogout: () => {},
  });
}

describe("setter notifications", () => {
  test("a real change notifies subscribers exactly once", () => {
    const store = makeStore();
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    store.getState().setWikiOpen(true);
    expect(store.getState().wikiOpen).toBe(true);
    expect(notifications).toBe(1);
  });

  test("setting the current value again does not notify", () => {
    const store = makeStore();
    store.getState().setWikiOpen(true);
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    store.getState().setWikiOpen(true);
    expect(notifications).toBe(0);
  });

  test("an updater returning the current reference does not notify", () => {
    const store = makeStore();
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    store.getState().setOwnCharacter((current) => current);
    store.getState().setFightState((current) => current);
    expect(notifications).toBe(0);
  });

  test("a multi-key set applies every key when only a later key changed", () => {
    const store = makeStore();
    store.getState().setQuestLogError("rate-limited");
    // questLog is already null; the reset of questLogError must still land.
    store.getState().setQuestLog(null);
    expect(store.getState().questLog).toBeNull();
    expect(store.getState().questLogError).toBeNull();
  });

  test("updaters observe the freshest state across chained calls", () => {
    const store = makeStore();
    store.getState().appendCombatLog("first");
    store.getState().appendCombatLog("second");
    expect(store.getState().combatLog).toEqual(["first", "second"]);
  });

  test("screen messages keep advancing their id so equal texts still render", () => {
    const store = makeStore();
    store.getState().showScreenMessage("It is locked.", "status");
    const first = store.getState().screenMessage;
    store.getState().showScreenMessage("It is locked.", "status");
    const second = store.getState().screenMessage;
    expect(first?.id).not.toBe(second?.id);
  });
});
