import { expect, test } from "vitest";
import { createRoot } from "react-dom/client";
import {
  clientMessageSchema,
  serverMessageSchema,
  type ClientMessage,
  type Direction,
  type Position,
} from "@tibia/protocol";
import "../i18n/i18n";
import GameWindow from "../components/GameWindow";

/**
 * This mounts the real GameWindow against the real game server, continuously
 * walks the own character back and forth along one verified corridor for two
 * minutes, and records each layer independently: input intents, socket
 * lifecycle, authoritative own-player movement, and browser frame stalls.
 */
const WS_URL = "ws://127.0.0.1:4124";
const TOKEN = "dev-freeze-e2e";
const CHARACTER = "Freeze Probe";
/** Let world entry, texture preloads, and first region draws finish. */
const SETTLE_MS = 10_000;
/** Long enough to span at least four 30s server save/heartbeat periods. */
const MEASURE_MS = 120_000;
/** A main-thread stall this long is a user-visible freeze. */
const FREEZE_MS = 150;
const MAX_MOVEMENT_LATENESS_MS = 350;
const WALK_START = { x: 32_394, y: 32_226, z: 7 } satisfies Position;
const WALK_END_Y = 32_233;

interface StallEvent {
  atMs: number;
  durationMs: number;
  source: "longtask" | "frame-gap";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(
  find: () => T | null | undefined,
  label: string,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = find();
    if (found) return found;
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await sleep(100);
  }
}

/**
 * Creates the probe character over the wire (dev auth) so the UI flow in
 * the test only ever needs to click "Enter World".
 */
async function ensureCharacterExists(): Promise<void> {
  const socket = new WebSocket(WS_URL);
  const messages: Array<{ type: string; characters?: Array<{ name: string }> }> =
    [];
  socket.onmessage = (event) => {
    messages.push(JSON.parse(event.data as string));
  };
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error(`cannot reach ${WS_URL}`));
  });
  const send = (message: unknown) => socket.send(JSON.stringify(message));
  const nextMessage = (type: string) =>
    waitFor(
      () => messages.find((message) => message.type === type),
      `${type} message`,
      15_000,
    );

  send({ type: "auth", token: TOKEN, language: "en" });
  await nextMessage("auth-ok");
  send({ type: "list-characters" });
  const list = await nextMessage("character-list");
  if (!list.characters?.some((character) => character.name === CHARACTER)) {
    send({
      type: "create-character",
      name: CHARACTER,
      vocation: "Knight",
      lookType: 128,
    });
    await waitFor(
      () =>
        messages.find(
          (message) =>
            message.type === "character-list" &&
            message.characters?.some(
              (character) => character.name === CHARACTER,
            ),
        ),
      "character creation",
      15_000,
    );
  }
  socket.close();
}

interface MovementReceipt {
  atMs: number;
  durationMs: number;
  direction: Direction;
  position: Position;
  positionRevision: number;
}

interface TimelineEvent {
  atMs: number;
  detail: string;
}

interface WireProbe {
  movesSent: number;
  stopsSent: number;
  creatureMovesReceived: number;
  ownMoves: MovementReceipt[];
  timeline: TimelineEvent[];
  record(detail: string): void;
  send(message: ClientMessage): void;
  restore(): void;
}

/**
 * Wraps the page's WebSocket so the test can verify real gameplay happened:
 * a pass with zero movement would only prove an idle client doesn't freeze.
 */
function instrumentWebSocket(): WireProbe {
  const ownMoves: MovementReceipt[] = [];
  const timeline: TimelineEvent[] = [];
  let movesSent = 0;
  let stopsSent = 0;
  let creatureMovesReceived = 0;
  let ownPlayerId: string | null = null;
  let gameplaySocket: WebSocket | null = null;
  const creatureNames = new Map<string, string>();
  const NativeWebSocket = window.WebSocket;
  const rememberGameplaySocket = (socket: WebSocket) => {
    gameplaySocket = socket;
  };
  window.WebSocket = class extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      rememberGameplaySocket(this);
      this.addEventListener("open", () => {
        timeline.push({ atMs: performance.now(), detail: "socket open" });
      });
      this.addEventListener("close", (event) => {
        timeline.push({
          atMs: performance.now(),
          detail: `socket close code=${event.code}`,
        });
      });
      this.addEventListener("error", () => {
        timeline.push({ atMs: performance.now(), detail: "socket error" });
      });
      this.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        let json: unknown;
        try {
          json = JSON.parse(event.data);
        } catch {
          return;
        }
        const parsed = serverMessageSchema.safeParse(json);
        if (!parsed.success) return;
        if (parsed.data.type === "welcome") {
          ownPlayerId = parsed.data.playerId;
          for (const creature of parsed.data.creatures) {
            creatureNames.set(creature.id, creature.name);
          }
          timeline.push({
            atMs: performance.now(),
            detail: `welcome player=${parsed.data.playerId}`,
          });
          return;
        }
        if (parsed.data.type === "creature-joined") {
          creatureNames.set(parsed.data.creature.id, parsed.data.creature.name);
          return;
        }
        if (parsed.data.type === "creature-left") {
          creatureNames.delete(parsed.data.creatureId);
          return;
        }
        if (parsed.data.type === "fight-state") {
          const conditions = parsed.data.fightState.conditions
            .map(
              (condition) =>
                `${condition.type}:${condition.remainingMs}ms`,
            )
            .join(",");
          timeline.push({
            atMs: performance.now(),
            detail: `fight-state conditions=${conditions || "none"}`,
          });
          return;
        }
        if (parsed.data.type === "combat-log") {
          timeline.push({
            atMs: performance.now(),
            detail: `combat-log ${parsed.data.kind}: ${parsed.data.text}`,
          });
          return;
        }
        if (
          parsed.data.type === "position-correction" &&
          parsed.data.playerId === ownPlayerId
        ) {
          timeline.push({
            atMs: performance.now(),
            detail:
              `correction ${parsed.data.reason} retry=${parsed.data.retryAfterMs}ms ` +
              `rev=${parsed.data.positionRevision} ` +
              `pos=${parsed.data.position.x},${parsed.data.position.y},${parsed.data.position.z}`,
          });
          return;
        }
        if (parsed.data.type !== "creature-moved") return;
        creatureMovesReceived += 1;
        if (parsed.data.creatureId !== ownPlayerId) {
          if (
            Math.abs(parsed.data.position.x - WALK_START.x) <= 1 &&
            parsed.data.position.y >= WALK_START.y - 1 &&
            parsed.data.position.y <= WALK_END_Y + 1 &&
            parsed.data.position.z === WALK_START.z
          ) {
            timeline.push({
              atMs: performance.now(),
              detail:
                `nearby move ${creatureNames.get(parsed.data.creatureId) ?? parsed.data.creatureId} ` +
                `pos=${parsed.data.position.x},${parsed.data.position.y},${parsed.data.position.z}`,
            });
          }
          return;
        }
        const receipt = {
          atMs: performance.now(),
          durationMs: parsed.data.durationMs,
          direction: parsed.data.direction,
          position: { ...parsed.data.position },
          positionRevision: parsed.data.positionRevision,
        };
        ownMoves.push(receipt);
        timeline.push({
          atMs: receipt.atMs,
          detail:
            `own move ${receipt.direction} duration=${receipt.durationMs}ms ` +
            `rev=${receipt.positionRevision} ` +
            `pos=${receipt.position.x},${receipt.position.y},${receipt.position.z}`,
        });
      });
    }

    override send(data: Parameters<WebSocket["send"]>[0]): void {
      if (typeof data === "string") {
        let json: unknown;
        try {
          json = JSON.parse(data);
        } catch {
          json = null;
        }
        const parsed = clientMessageSchema.safeParse(json);
        if (parsed.success && parsed.data.type === "move") {
          movesSent += 1;
          timeline.push({
            atMs: performance.now(),
            detail:
              `send move ${parsed.data.direction} queueStep=${String(parsed.data.queueStep)}`,
          });
        }
        if (parsed.success && parsed.data.type === "stop-move") {
          stopsSent += 1;
          timeline.push({ atMs: performance.now(), detail: "send stop-move" });
        }
      }
      super.send(data);
    }
  };
  return {
    get movesSent() {
      return movesSent;
    },
    get creatureMovesReceived() {
      return creatureMovesReceived;
    },
    get stopsSent() {
      return stopsSent;
    },
    ownMoves,
    timeline,
    record(detail) {
      timeline.push({ atMs: performance.now(), detail });
    },
    send(message) {
      if (gameplaySocket?.readyState !== WebSocket.OPEN) {
        throw new Error("gameplay WebSocket is not open");
      }
      gameplaySocket.send(JSON.stringify(message));
    },
    restore() {
      window.WebSocket = NativeWebSocket;
    },
  };
}

function findEnterWorldButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find(
    (button) =>
      button.textContent?.includes("Enter World") && !button.disabled,
  );
}

function pressKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
}

function releaseKey(code: string): void {
  window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
}

test(
  "continuous movement has no periodic own-character or browser stall",
  { timeout: 300_000 },
  async () => {
    await ensureCharacterExists();
    const wire = instrumentWebSocket();

    const longTasks: StallEvent[] = [];
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) {
        longTasks.push({
          atMs: entry.startTime,
          durationMs: entry.duration,
          source: "longtask",
        });
      }
    });
    observer.observe({ entryTypes: ["longtask"] });

    const frameGaps: StallEvent[] = [];
    let lastFrameAt = performance.now();
    let framesStopped = false;
    const onFrame = () => {
      const now = performance.now();
      if (now - lastFrameAt >= 100) {
        frameGaps.push({
          atMs: lastFrameAt,
          durationMs: now - lastFrameAt,
          source: "frame-gap",
        });
      }
      lastFrameAt = now;
      if (!framesStopped) requestAnimationFrame(onFrame);
    };
    requestAnimationFrame(onFrame);

    // Chromium-only heap samples: a sawtooth drop right at a stall means GC.
    const heapSamples: Array<{ atMs: number; bytes: number }> = [];
    const heapTimer = setInterval(() => {
      const memory = (
        performance as { memory?: { usedJSHeapSize: number } }
      ).memory;
      if (memory) {
        heapSamples.push({
          atMs: performance.now(),
          bytes: memory.usedJSHeapSize,
        });
      }
    }, 1_000);

    const host = document.createElement("div");
    host.style.width = "1024px";
    host.style.height = "640px";
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<GameWindow accessToken={TOKEN} onLogout={async () => {}} />);

    try {
      const enterWorld = await waitFor(
        findEnterWorldButton,
        "Enter World button",
        60_000,
      );
      enterWorld.click();
      await waitFor(
        () => host.querySelector("canvas"),
        "world canvas",
        60_000,
      );
      await sleep(SETTLE_MS);

      // The probe database survives between local runs. If the character was
      // last saved at WALK_START, /goto would treat its own occupied tile as
      // unavailable and choose an adjacent tile. Move elsewhere first so the
      // route's exact start is always free.
      const movesBeforeStaging = wire.ownMoves.length;
      wire.send({
        type: "speak",
        mode: "say",
        text: `/goto ${WALK_START.x} ${WALK_END_Y} ${WALK_START.z}`,
      });
      await waitFor(
        () =>
          wire.ownMoves.length > movesBeforeStaging
            ? wire.ownMoves.at(-1)
            : null,
        "staging teleport",
        15_000,
      );

      wire.send({
        type: "speak",
        mode: "say",
        text: `/goto ${WALK_START.x} ${WALK_START.y} ${WALK_START.z}`,
      });
      await waitFor(
        () =>
          wire.ownMoves.find(
            ({ position }) =>
              position.x === WALK_START.x &&
              position.y === WALK_START.y &&
              position.z === WALK_START.z,
          ),
        "walking-route teleport",
        15_000,
      );
      await sleep(2_000);

      const measureStart = performance.now();
      wire.ownMoves.length = 0;
      wire.record("measurement start");
      let code = "ArrowDown";
      let direction: Direction = "south";
      let targetY = WALK_END_Y;
      wire.record(`press ${code}`);
      pressKey(code);
      let probedRevision = -1;
      const rejectionProbeTimer = setInterval(() => {
        const latest = wire.ownMoves.at(-1);
        if (
          !latest ||
          latest.positionRevision === probedRevision ||
          performance.now() - latest.atMs <
            latest.durationMs + MAX_MOVEMENT_LATENESS_MS
        ) {
          return;
        }
        probedRevision = latest.positionRevision;
        wire.record(`probe delayed movement ${direction}`);
        wire.send({ type: "move", direction, queueStep: true });
      }, 50);
      try {
        while (performance.now() - measureStart < MEASURE_MS) {
          await waitFor(
            () => {
              const latest = wire.ownMoves.at(-1)?.position;
              return latest?.x === WALK_START.x &&
                latest.y === targetY &&
                latest.z === WALK_START.z
                ? latest
                : null;
            },
            `continuous walk to y=${targetY}`,
            15_000,
          );
          wire.record(`release ${code} at target y=${targetY}`);
          releaseKey(code);
          code = code === "ArrowDown" ? "ArrowUp" : "ArrowDown";
          direction = direction === "south" ? "north" : "south";
          targetY = targetY === WALK_END_Y ? WALK_START.y : WALK_END_Y;
          wire.record(`press ${code} toward y=${targetY}`);
          pressKey(code);
        }
      } finally {
        clearInterval(rejectionProbeTimer);
        wire.record(`final release ${code}`);
        releaseKey(code);
      }

      expect(
        wire.movesSent,
        "the probe never sent move intents — input plumbing broke",
      ).toBeGreaterThan(20);
      const walkMoves = wire.ownMoves.filter(({ durationMs }) => durationMs > 0);
      expect(
        walkMoves.length,
        "the server never moved the own character — the world was idle",
      ).toBeGreaterThan(20);

      const movementGaps = walkMoves.slice(1).map((move, index) => {
        const previous = walkMoves[index]!;
        return {
          previous,
          move,
          actualMs: move.atMs - previous.atMs,
          lateMs: move.atMs - previous.atMs - previous.durationMs,
        };
      });
      const delayedMoves = movementGaps
        .filter(({ lateMs }) => lateMs >= MAX_MOVEMENT_LATENESS_MS)
        .sort((left, right) => right.lateMs - left.lateMs);
      const worstMovementLateness = Math.max(
        0,
        ...movementGaps.map(({ lateMs }) => lateMs),
      );

      const measured = [...longTasks, ...frameGaps].filter(
        (stall) => stall.atMs >= measureStart,
      );
      const worst = measured.reduce(
        (max, stall) => Math.max(max, stall.durationMs),
        0,
      );
      console.log(
        `freeze probe: ${wire.movesSent} move intents, ` +
          `${wire.creatureMovesReceived} creature moves, ` +
          `${wire.stopsSent} stop intents, ` +
          `${measured.length} recorded stalls, worst ${worst.toFixed(0)}ms, ` +
          `worst own-movement lateness ${worstMovementLateness.toFixed(0)}ms`,
      );

      const freezes = measured
        .filter((stall) => stall.durationMs >= FREEZE_MS)
        .sort((a, b) => a.atMs - b.atMs);

      const timeline = freezes
        .map((stall) => {
          const secondsIn = ((stall.atMs - measureStart) / 1000).toFixed(1);
          const heapBefore = heapSamples.filter(
            (sample) => sample.atMs <= stall.atMs,
          );
          const heapAfter = heapSamples.find(
            (sample) => sample.atMs > stall.atMs + stall.durationMs,
          );
          const heapDelta =
            heapBefore.length > 0 && heapAfter
              ? `${(
                  (heapAfter.bytes -
                    heapBefore[heapBefore.length - 1]!.bytes) /
                  1024 /
                  1024
                ).toFixed(1)}MB heap change`
              : "no heap data";
          return `  t+${secondsIn}s ${stall.source} ${stall.durationMs.toFixed(0)}ms (${heapDelta})`;
        })
        .join("\n");

      const movementTimeline = delayedMoves
        .map(({ previous, move, actualMs, lateMs }) => {
          const secondsIn = ((move.atMs - measureStart) / 1000).toFixed(1);
          const nearbyEvents = wire.timeline
            .filter(
              (event) =>
                event.atMs >= previous.atMs - 100 &&
                event.atMs <= move.atMs + 100,
            )
            .map(
              (event) =>
                `      t+${((event.atMs - measureStart) / 1000).toFixed(3)}s ${event.detail}`,
            )
            .join("\n");
          return (
            `  t+${secondsIn}s authoritative gap ${actualMs.toFixed(0)}ms ` +
            `(late ${lateMs.toFixed(0)}ms after ${previous.durationMs}ms step)\n` +
            nearbyEvents
          );
        })
        .join("\n");

      expect(
        delayedMoves.length,
        `own-character movement had ${delayedMoves.length} delayed authoritative packet(s):\n${movementTimeline}`,
      ).toBe(0);

      expect(
        freezes.length,
        `client main thread froze ${freezes.length} time(s) ≥${FREEZE_MS}ms during ${MEASURE_MS / 1000}s of play:\n${timeline}`,
      ).toBe(0);
    } finally {
      clearInterval(heapTimer);
      framesStopped = true;
      observer.disconnect();
      root.unmount();
      host.remove();
      wire.restore();
    }
  },
);
