"use client";

import { useEffect } from "react";
import type { ServerMessage } from "@tibia/protocol";
import type { GameClient } from "../../../lib/net/GameClient";
import type { WorldRenderer } from "../../../lib/render/WorldRenderer";
import { updateVisibleCreaturesBatch } from "../../../lib/creatures/updateVisibleCreaturesBatch";
import { isEditableTarget } from "../../../lib/hotkeys/isEditableTarget";
import { getHeldMovementDirection } from "../../../lib/movement/getHeldMovementDirection";
import { getKeyboardTurnDirection } from "../../../lib/movement/getKeyboardTurnDirection";
import { useGameSettingsStore } from "../../../stores/useGameSettingsStore";
import { useLanguageStore } from "../../../stores/useLanguageStore";
import { handleCharacterSessionMessage } from "../messages/handleCharacterSessionMessage";
import { handleCommerceMessage } from "../messages/handleCommerceMessage";
import { handleCommunityMessage } from "../messages/handleCommunityMessage";
import { handleDialogueMessage } from "../messages/handleDialogueMessage";
import { handlePlayerStateMessage } from "../messages/handlePlayerStateMessage";
import { handleProgressionCatalogMessage } from "../messages/handleProgressionCatalogMessage";
import { useGameWindowStore } from "../store/useGameWindowStore";
import { useGameWindowStoreApi } from "../store/useGameWindowStoreApi";
import { handleGameClientError } from "./handleGameClientError";
import { handleGameClientStatus } from "./handleGameClientStatus";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4000";

export function GameWindowConnectionController() {
  const store = useGameWindowStoreApi();
  const accessToken = useGameWindowStore((state) => state.accessToken);
  const connectionAttempt = useGameWindowStore(
    (state) => state.connectionAttempt,
  );
  const sessionActions = useGameWindowStore(
    (state) => state.sessionActions,
  );
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  useEffect(() => {
    store.getState().runtime.languageRef.current = language;
  }, [language, store]);

  useEffect(() => {
    const runtime = store.getState().runtime;
    const container = runtime.containerRef.current;
    if (!container || !sessionActions) return;

    let disposed = false;
    let client: GameClient | undefined;
    let renderer: WorldRenderer | undefined;
    let heldMovementKeys: ReadonlyArray<string> = [];
    let creatureFrame: number | null = null;
    let creatureMessages: ServerMessage[] = [];
    runtime.joinedRef.current = false;

    const flushCreatureMessages = () => {
      creatureFrame = null;
      const messages = creatureMessages;
      creatureMessages = [];
      store.getState().setVisibleCreatures((current) => {
        const next = updateVisibleCreaturesBatch(current, messages);
        runtime.visibleCreaturesRef.current = next;
        return next;
      });
    };

    const queueCreatureMessage = (message: ServerMessage) => {
      creatureMessages.push(message);
      creatureFrame ??= window.requestAnimationFrame(flushCreatureMessages);
    };

    const syncViewport = () => {
      const range = renderer?.setViewportSize(
        container.clientWidth,
        container.clientHeight,
      );
      if (range) client?.setViewport(range);
    };
    const resizeObserver = new ResizeObserver(syncViewport);
    resizeObserver.observe(container);

    const connect = async () => {
      const [{ GameClient }, { createGameWindowRenderer }] =
        await Promise.all([
          import("../../../lib/net/GameClient"),
          import("./createGameWindowRenderer"),
        ]);
      if (disposed) return;

      const worldRenderer = createGameWindowRenderer(
        store,
        () => client,
        () => disposed,
      );
      await worldRenderer.init(container);
      if (disposed) {
        worldRenderer.destroy();
        return;
      }
      renderer = worldRenderer;
      runtime.rendererRef.current = worldRenderer;
      syncViewport();

      client = new GameClient(WS_URL, {
        onMessage: (message) => {
          if (disposed || !client) return;
          queueCreatureMessage(message);

          const context = { client, renderer: worldRenderer, store };
          if (handleCharacterSessionMessage(message, context)) return;
          if (handleDialogueMessage(message, context)) return;
          if (handleCommerceMessage(message, context)) return;
          if (handleCommunityMessage(message, context)) return;
          if (handleProgressionCatalogMessage(message, context)) return;
          if (handlePlayerStateMessage(message, context)) return;
          worldRenderer.applyMessage(message);
        },
        onStatus: (nextStatus) => {
          if (disposed) return;
          handleGameClientStatus(nextStatus, store);
        },
        onLanguage: (nextLanguage) => {
          if (disposed) return;
          runtime.confirmedLanguageRef.current = nextLanguage;
          setLanguage(nextLanguage);
          const state = store.getState();
          state.setLanguageSaving(false);
          state.setLanguageError(false);
        },
        onError: (code) => {
          if (disposed) return;
          handleGameClientError(code, worldRenderer, setLanguage, store);
        },
      });
      runtime.clientRef.current = client;
      syncViewport();
      client.connect(accessToken, runtime.languageRef.current);
    };

    void connect();

    const sendHeldDirection = (queueStep: boolean) => {
      const direction = getHeldMovementDirection(
        heldMovementKeys,
        useGameSettingsStore.getState().diagonalWalking,
      );
      if (!direction) return;
      client?.sendMove(direction, queueStep);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isEditableTarget(event.target)) {
        const state = store.getState();
        if (
          state.runeTargeting ||
          state.potionTargeting ||
          state.useWithTargeting
        ) {
          runtime.pendingRuneRef.current = null;
          runtime.pendingPotionRef.current = null;
          runtime.pendingUseWithRef.current = null;
          runtime.pendingActionBarRef.current = null;
          state.setRuneTargeting(false);
          state.setPotionTargeting(false);
          state.setUseWithTargeting(false);
          event.preventDefault();
          return;
        }
      }
      const turnDirection = getKeyboardTurnDirection(event);
      if (
        turnDirection &&
        runtime.joinedRef.current &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        if (event.repeat) return;
        heldMovementKeys = [];
        client?.turn(turnDirection);
        return;
      }
      const direction = getHeldMovementDirection(
        [event.code],
        useGameSettingsStore.getState().diagonalWalking,
      );
      if (
        !direction ||
        !runtime.joinedRef.current ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      if (heldMovementKeys.includes(event.code)) return;
      heldMovementKeys = [...heldMovementKeys, event.code];
      sendHeldDirection(true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!getHeldMovementDirection([event.code], true)) return;
      if (!runtime.joinedRef.current) return;
      if (
        isEditableTarget(event.target) &&
        !heldMovementKeys.includes(event.code)
      ) {
        return;
      }
      event.preventDefault();
      const wasActive =
        heldMovementKeys[heldMovementKeys.length - 1] === event.code;
      heldMovementKeys = heldMovementKeys.filter(
        (keyCode) => keyCode !== event.code,
      );
      if (!wasActive) return;
      if (heldMovementKeys.length > 0) {
        sendHeldDirection(false);
        return;
      }
      client?.stopMoving();
    };

    const onBlur = () => {
      if (heldMovementKeys.length === 0) return;
      heldMovementKeys = [];
      client?.stopMoving();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      resizeObserver.disconnect();
      if (creatureFrame !== null) {
        window.cancelAnimationFrame(creatureFrame);
      }
      creatureMessages = [];
      client?.disconnect();
      runtime.clientRef.current = null;
      renderer?.destroy();
      runtime.rendererRef.current = null;
      runtime.joinedRef.current = false;
    };
  }, [
    accessToken,
    connectionAttempt,
    sessionActions,
    setLanguage,
    store,
  ]);

  return null;
}
