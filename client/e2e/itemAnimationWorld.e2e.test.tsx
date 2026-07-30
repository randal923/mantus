import { expect, test } from "vitest";
import { page } from "@vitest/browser/context";
import { createRoot } from "react-dom/client";
import "../i18n/i18n";
import GameWindow from "../components/GameWindow";

/**
 * Mounts the real GameWindow against the memory-backed animation probe server
 * (server/src/playtest/itemAnimationProbeServer.ts) and verifies item
 * animations end to end in the running game:
 *
 * - the equipped exercise sword's paperdoll icon cycles through its phases,
 * - the world canvas keeps changing while the character stands still in the
 *   Thais temple protection zone: no creature can get in and our own outfit
 *   holds its standing frame, so the only thing moving is the map itself. The
 *   scene there is four animated coal basins (client id 2110, eleven phases at
 *   100–200ms) — no torches, no water — so this asserts that the canvas keeps
 *   reaching *distinct* frames rather than any particular pixel count, which
 *   depends on which phase pair a sample happens to straddle.
 */
/**
 * This test needs the memory-backed probe server, not the default e2e server:
 *   yarn workspace server playtest:animation-probe:server &
 *   PLAYTEST_EXTERNAL_SERVER=1 VITE_PLAYTEST_WS_URL=ws://127.0.0.1:4126 \
 *     yarn workspace client test:e2e e2e/itemAnimationWorld.e2e.test.tsx
 * It skips itself in the default lane, whose server has neither the probe
 * token nor the seeded character.
 */
const ON_PROBE_SERVER = (
  (import.meta.env.VITE_PLAYTEST_WS_URL as string | undefined) ?? ""
).endsWith(":4126");
const TOKEN = "anim-probe";
/** First atlas sprite of the exercise sword (clientId 28552, 5 phases). */
const EXERCISE_SWORD_SPRITE = 25_676;
const SETTLE_MS = 8_000;

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

/** The atlas cell background-position SpriteIcon computes for a sprite id. */
function atlasPosition(spriteId: number): string {
  const cell = spriteId - 1;
  const rem = cell % 14_400;
  const x = (rem % 120) * 34 + 1;
  const y = Math.floor(rem / 120) * 34 + 1;
  return `${-x}px ${-y}px`;
}

function findIconAt(position: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>("[style]")].find(
    (element) =>
      element.style.backgroundImage.includes("atlas-") &&
      element.style.backgroundPosition === position,
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

/** Cheap order-sensitive digest, so distinct frames can be counted. */
function frameSignature(pixels: Uint8Array): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < pixels.length; index += 16) {
    hash ^= pixels[index];
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16);
}

function countLitPixels(pixels: Uint8Array): number {
  let lit = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index] || pixels[index + 1] || pixels[index + 2]) lit += 1;
  }
  return lit;
}

test.skipIf(!ON_PROBE_SERVER)(
  "equipped items and map items animate in the running game",
  { timeout: 240_000 },
  async () => {
    // The default mobile-sized viewport would crop most of the water out of
    // the world canvas.
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
        () => host.querySelector("canvas"),
        "world canvas",
        60_000,
      );
      await sleep(SETTLE_MS);

      // The inventory panel starts closed; the I hotkey opens the paperdoll.
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "KeyI", bubbles: true }),
      );

      // Paperdoll: the exercise sword icon must leave its first frame and
      // cycle through several atlas cells.
      const firstFramePosition = atlasPosition(EXERCISE_SWORD_SPRITE);
      const icon = await waitFor(
        () =>
          findIconAt(firstFramePosition) ??
          findIconAt(atlasPosition(EXERCISE_SWORD_SPRITE + 1)) ??
          findIconAt(atlasPosition(EXERCISE_SWORD_SPRITE + 2)) ??
          findIconAt(atlasPosition(EXERCISE_SWORD_SPRITE + 3)) ??
          findIconAt(atlasPosition(EXERCISE_SWORD_SPRITE + 4)),
        "exercise sword paperdoll icon",
        30_000,
      );
      const iconPositions = new Set<string>();
      const iconDeadline = Date.now() + 3_000;
      while (Date.now() < iconDeadline) {
        iconPositions.add(icon.style.backgroundPosition);
        await sleep(40);
      }
      expect(iconPositions.size).toBeGreaterThanOrEqual(3);

      // World: the standing-still temple must keep reaching new frames as the
      // braziers step through their phases.
      const signatures = new Set<string>();
      let litFloor = 0;
      for (let sample = 0; sample < 12; sample++) {
        const pixels = await captureFrame(canvas as HTMLCanvasElement);
        litFloor = Math.max(litFloor, countLitPixels(pixels));
        signatures.add(frameSignature(pixels));
        await sleep(120);
      }
      // Guard against blank readbacks: an unpainted canvas would look static.
      expect(litFloor).toBeGreaterThan(1_000);
      expect(signatures.size).toBeGreaterThanOrEqual(3);
    } finally {
      root.unmount();
      host.remove();
    }
  },
);
