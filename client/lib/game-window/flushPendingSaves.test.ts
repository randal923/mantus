import {
  createDefaultActionBar,
  DEFAULT_ACTION_BOT_SETTINGS,
  DEFAULT_HUNTING_BOT_ROUTE,
  type UiSettings,
} from "@tibia/protocol";
import { describe, expect, it, vi } from "vitest";
import type { GameWindowRuntime } from "../../components/game-window/types/GameWindowRuntime";
import { flushPendingSaves } from "./flushPendingSaves";

function armTimer(callback: () => void): ReturnType<typeof setTimeout> {
  return setTimeout(callback, 800) as unknown as ReturnType<typeof setTimeout>;
}

function createRuntime(uiSettings: UiSettings) {
  const updateActionBar = vi.fn();
  const updateActionBot = vi.fn();
  const updateUiSettings = vi.fn();
  const updateHuntingBotRoute = vi.fn();
  const runtime = {
    clientRef: {
      current: {
        updateActionBar,
        updateActionBot,
        updateUiSettings,
        updateHuntingBotRoute,
      },
    },
    actionBarRef: { current: createDefaultActionBar() },
    actionBotSettingsRef: {
      current: { ...DEFAULT_ACTION_BOT_SETTINGS, rules: [] },
    },
    actionBarSaveTimerRef: { current: null },
    actionBotSaveTimerRef: { current: null },
    huntingBotRouteRef: {
      current: { ...DEFAULT_HUNTING_BOT_ROUTE, waypoints: [] },
    },
    huntingBotSaveTimerRef: { current: null },
    uiSettingsRef: { current: uiSettings },
    uiSettingsSaveTimerRef: { current: null },
  } as unknown as GameWindowRuntime;
  return {
    runtime,
    updateActionBar,
    updateActionBot,
    updateUiSettings,
    updateHuntingBotRoute,
  };
}

describe("flushPendingSaves", () => {
  it("sends a pending debounced action-bar save immediately", () => {
    vi.useFakeTimers();
    const { runtime, updateActionBar } = createRuntime({});
    const send = vi.fn();
    runtime.actionBarSaveTimerRef.current = armTimer(send);

    flushPendingSaves(runtime);

    expect(updateActionBar).toHaveBeenCalledTimes(1);
    expect(updateActionBar).toHaveBeenCalledWith(runtime.actionBarRef.current);
    expect(runtime.actionBarSaveTimerRef.current).toBeNull();

    // The cancelled timer must not fire a second save afterwards.
    vi.advanceTimersByTime(2_000);
    expect(send).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("sends a pending debounced action-bot save immediately", () => {
    vi.useFakeTimers();
    const { runtime, updateActionBar, updateActionBot } = createRuntime({});
    runtime.actionBotSaveTimerRef.current = armTimer(() => {});

    flushPendingSaves(runtime);

    expect(updateActionBot).toHaveBeenCalledWith(
      runtime.actionBotSettingsRef.current,
    );
    expect(updateActionBar).not.toHaveBeenCalled();
    expect(runtime.actionBotSaveTimerRef.current).toBeNull();
    vi.useRealTimers();
  });

  it("sends a pending minimap layout save immediately", () => {
    vi.useFakeTimers();
    const layout = { x: 4, y: 8, width: 120, height: 120, floorOffset: 0 };
    const { runtime, updateUiSettings } = createRuntime({
      minimap: layout,
    } as UiSettings);
    runtime.uiSettingsSaveTimerRef.current = armTimer(() => {});

    flushPendingSaves(runtime);

    expect(updateUiSettings).toHaveBeenCalledWith(runtime.uiSettingsRef.current);
    expect(runtime.uiSettingsSaveTimerRef.current).toBeNull();
    vi.useRealTimers();
  });

  it("sends a pending debounced hunting-route save immediately", () => {
    vi.useFakeTimers();
    const { runtime, updateHuntingBotRoute } = createRuntime({});
    runtime.huntingBotSaveTimerRef.current = armTimer(() => {});

    flushPendingSaves(runtime);

    expect(updateHuntingBotRoute).toHaveBeenCalledWith(
      runtime.huntingBotRouteRef.current,
    );
    expect(runtime.huntingBotSaveTimerRef.current).toBeNull();
    vi.useRealTimers();
  });

  it("sends nothing when no save is pending", () => {
    const {
      runtime,
      updateActionBar,
      updateActionBot,
      updateUiSettings,
      updateHuntingBotRoute,
    } = createRuntime({});

    flushPendingSaves(runtime);

    expect(updateActionBar).not.toHaveBeenCalled();
    expect(updateActionBot).not.toHaveBeenCalled();
    expect(updateUiSettings).not.toHaveBeenCalled();
    expect(updateHuntingBotRoute).not.toHaveBeenCalled();
  });

  it("does not throw when the connection is already gone", () => {
    vi.useFakeTimers();
    const { runtime } = createRuntime({});
    runtime.clientRef.current = null;
    runtime.actionBarSaveTimerRef.current = armTimer(() => {});

    expect(() => flushPendingSaves(runtime)).not.toThrow();
    expect(runtime.actionBarSaveTimerRef.current).toBeNull();
    vi.useRealTimers();
  });
});
