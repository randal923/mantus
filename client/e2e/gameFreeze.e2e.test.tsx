import { expect, test } from "vitest";
import { createRoot } from "react-dom/client";
import "../i18n/i18n";
import GameWindow from "../components/GameWindow";

/**
 * Hypothesis test for "the game freezes for a bit every 20-30 seconds":
 * the server tick loop was measured clean under active play (see
 * server/src/playtest/scenarios/tickStallProbe.ts), so a periodic freeze
 * must be a browser main-thread stall (long task / GC pause / render hitch).
 *
 * This mounts the real GameWindow against the real game server (playtest
 * harness), enters the world through the actual UI, walks for 2 minutes,
 * and records every main-thread stall via the Long Task API plus
 * requestAnimationFrame gaps. Any stall at or above FREEZE_MS fails the
 * test and the failure message lists the stall timeline, so a 20-30s
 * cadence is visible directly in the output.
 */
const WS_URL = "ws://127.0.0.1:4124";
const TOKEN = "dev-freeze-e2e";
const CHARACTER = "Freeze Probe";
/** Let world entry, texture preloads, and first region draws finish. */
const SETTLE_MS = 10_000;
/** Long enough to span at least four 30s server save/heartbeat periods. */
const MEASURE_MS = 120_000;
/** A main-thread stall this long is a user-visible freeze. */
const FREEZE_MS = 250;
const HOLD_KEY_MS = 2_000;

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

interface WireCounters {
  movesSent: number;
  creatureMovesReceived: number;
}

/**
 * Wraps the page's WebSocket so the test can verify real gameplay happened:
 * a pass with zero movement would only prove an idle client doesn't freeze.
 */
function instrumentWebSocket(): WireCounters {
  const counters: WireCounters = { movesSent: 0, creatureMovesReceived: 0 };
  const NativeWebSocket = window.WebSocket;
  window.WebSocket = class extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener("message", (event) => {
        if (
          typeof event.data === "string" &&
          event.data.includes('"creature-moved"')
        ) {
          counters.creatureMovesReceived += 1;
        }
      });
    }

    override send(data: Parameters<WebSocket["send"]>[0]): void {
      if (typeof data === "string" && data.includes('"move"')) {
        counters.movesSent += 1;
      }
      super.send(data);
    }
  };
  return counters;
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
  "playing for 2 minutes never stalls the client main thread long enough to freeze",
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

      const measureStart = performance.now();
      const codes = ["ArrowLeft", "ArrowRight"];
      let step = 0;
      while (performance.now() - measureStart < MEASURE_MS) {
        const code = codes[step % 2]!;
        pressKey(code);
        await sleep(HOLD_KEY_MS);
        releaseKey(code);
        step += 1;
      }

      expect(
        wire.movesSent,
        "the probe never sent move intents — input plumbing broke",
      ).toBeGreaterThan(20);
      expect(
        wire.creatureMovesReceived,
        "the server never moved the character — the world was idle",
      ).toBeGreaterThan(20);

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
          `${measured.length} recorded stalls, worst ${worst.toFixed(0)}ms`,
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
    }
  },
);
