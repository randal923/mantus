import { expect, test } from "vitest";
import { page } from "@vitest/browser/context";
import { createRoot } from "react-dom/client";
import "../i18n/i18n";
import GameWindow from "../components/GameWindow";

/**
 * End-to-end world lighting: mounts the real GameWindow against the
 * memory-backed lighting probe server, whose character stands on open ground
 * far from any map light source. A GM helper on a second account forces the
 * ambient level over its own socket, and the test verifies the whole
 * pipeline — server broadcast, world-light message, multiply-blended
 * lightmap — by comparing world-canvas brightness:
 *
 * - night must darken the scene substantially versus day,
 * - but not to pitch black — the own player's minimum light keeps the
 *   immediate surroundings visible,
 * - and /light day must restore the daylight scene.
 */
/**
 * This test needs the memory-backed lighting probe server, not the default
 * e2e server:
 *   yarn workspace server playtest:lighting-probe:server &
 *   PLAYTEST_EXTERNAL_SERVER=1 VITE_PLAYTEST_WS_URL=ws://127.0.0.1:4127 \
 *     yarn workspace client test:e2e e2e/worldLighting.e2e.test.tsx
 * It skips itself in the default lane, whose server has neither the probe
 * tokens nor the seeded characters.
 */
const WS_URL =
  (import.meta.env.VITE_PLAYTEST_WS_URL as string | undefined) ?? "";
const ON_PROBE_SERVER = WS_URL.endsWith(":4127");
const TOKEN = "light-probe";
const GM_TOKEN = "light-probe-gm";
const SETTLE_MS = 8_000;
/** Covers the 50ms tick that broadcasts a forced level plus one render. */
const LIGHT_APPLY_MS = 1_500;

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
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(100);
  }
}

function findEnterWorldButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find(
    (button) => button.textContent?.includes("Enter World") && !button.disabled,
  );
}

/** Reads the world canvas inside a frame right after Pixi has drawn it. */
function captureFrame(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    requestAnimationFrame(() => {
      const gl =
        (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ??
        (canvas.getContext("webgl") as WebGLRenderingContext | null);
      if (!gl) {
        reject(new Error("world canvas has no WebGL context"));
        return;
      }
      const width = gl.drawingBufferWidth;
      const height = gl.drawingBufferHeight;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      resolve(pixels);
    });
  });
}

function averageBrightness(pixels: Uint8Array): number {
  let sum = 0;
  let count = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    sum +=
      ((pixels[index] ?? 0) +
        (pixels[index + 1] ?? 0) +
        (pixels[index + 2] ?? 0)) /
      3;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Runs one GM chat command through a short-lived helper session on the
 * second probe account, so the browser client's own session stays put.
 */
function gmCommand(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL);
    const fail = (reason: string) => {
      socket.close();
      reject(new Error(reason));
    };
    const timeout = setTimeout(
      () => fail(`gm command timed out: ${text}`),
      15_000,
    );
    const send = (message: unknown) => socket.send(JSON.stringify(message));
    socket.onopen = () =>
      send({ type: "auth", token: GM_TOKEN, language: "en" });
    socket.onerror = () => {
      clearTimeout(timeout);
      fail("gm helper socket error");
    };
    socket.onmessage = (event) => {
      const parsed: unknown = JSON.parse(String(event.data));
      const messages = Array.isArray(parsed) ? parsed : [parsed];
      for (const message of messages as Array<Record<string, unknown>>) {
        if (message.type === "auth-ok") send({ type: "list-characters" });
        if (message.type === "character-list") {
          const characters = message.characters as Array<{ id: string }>;
          const helper = characters[0];
          if (!helper) {
            clearTimeout(timeout);
            fail("gm helper character missing");
            return;
          }
          send({ type: "select-character", characterId: helper.id });
        }
        if (message.type === "welcome") {
          send({ type: "speak", mode: "say", text });
        }
        if (message.type === "gm-response") {
          clearTimeout(timeout);
          socket.close();
          if (message.ok) resolve();
          else reject(new Error(`gm command failed: ${String(message.text)}`));
          return;
        }
      }
    };
  });
}

/** Saves the capture as a PNG artifact for manual inspection. */
async function snapshot(
  source: HTMLCanvasElement,
  pixels: Uint8Array,
  name: string,
): Promise<void> {
  const gl = source.getContext("webgl2");
  const width = gl?.drawingBufferWidth ?? 0;
  const height = gl?.drawingBufferHeight ?? 0;
  const board = document.createElement("canvas");
  board.width = width;
  board.height = height;
  board.style.position = "fixed";
  board.style.left = "0";
  board.style.top = "0";
  board.style.zIndex = "10000";
  const context = board.getContext("2d");
  if (!context) return;
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const sourceRow = (height - 1 - y) * width * 4;
    image.data.set(pixels.subarray(sourceRow, sourceRow + width * 4), y * width * 4);
  }
  context.putImageData(image, 0, 0);
  document.body.appendChild(board);
  await page.screenshot({ path: `__screenshots__/lighting-${name}.png` });
  board.remove();
}

test.skipIf(!ON_PROBE_SERVER)(
  "night darkens open ground and /light day restores it",
  { timeout: 240_000 },
  async () => {
    await page.viewport(1280, 800);
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
      const canvas = await waitFor(
        () =>
          host.querySelector<HTMLCanvasElement>(
            'canvas[data-tibia-world="true"]',
          ),
        "world canvas",
        60_000,
      );
      await sleep(SETTLE_MS);

      const dayPixels = await captureFrame(canvas);
      const day = averageBrightness(dayPixels);
      await snapshot(canvas, dayPixels, "day");

      await gmCommand("/light 40");
      await sleep(LIGHT_APPLY_MS);
      const nightPixels = await captureFrame(canvas);
      const night = averageBrightness(nightPixels);
      await snapshot(canvas, nightPixels, "night");

      // Guard against a blank canvas passing the ratio checks trivially.
      expect(day).toBeGreaterThan(20);
      // Night ambient is 40/255 (~16%); the own player's glow keeps a few
      // tiles brighter, so expect between pitch black and half of daylight.
      expect(night).toBeLessThan(day * 0.5);
      expect(night).toBeGreaterThan(day * 0.02);

      await gmCommand("/light day");
      await sleep(LIGHT_APPLY_MS);
      const restored = averageBrightness(await captureFrame(canvas));
      expect(restored).toBeGreaterThan(day * 0.9);
    } finally {
      root.unmount();
      host.remove();
    }
  },
);
