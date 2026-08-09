import { expect, test } from "vitest";
import { createRoot } from "react-dom/client";
import { parseServerMessages, type Position } from "@tibia/protocol";
import "../i18n/i18n";
import GameWindow from "../components/GameWindow";

/**
 * Regression for the Carlin cultist key box: a plain right-click on the box
 * in the real client must send use-map and loot the bone key ("You have
 * found a bone key."), and a second right-click must answer "The box is
 * empty." — the exact interaction a player performs.
 */
const WS_URL = "ws://127.0.0.1:4124";
// The e2e database persists between runs, the box is once-per-character, and
// an account holds a bounded character list — so every run brings a fresh
// account token and a fresh, letters-only character name.
const RUN_SUFFIX = [...String(Date.now() % 1_000_000)]
  .map((digit) => "Abcdefghij"[Number(digit)])
  .join("");
const TOKEN = `dev-chest-click-e2e-${RUN_SUFFIX}`;
const CHARACTER = `Chest Probe ${RUN_SUFFIX}`;
const BOX = { x: 32_376, y: 31_802, z: 7 } satisfies Position;
const STAND = { x: 32_376, y: 31_803, z: 7 } satisfies Position;
/** World pixels per tile at the renderer's zoom (TILE_SIZE 32 × ZOOM 3). */
const TILE_PIXELS = 96;
const SETTLE_MS = 6_000;

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

function findEnterWorldButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find(
    (button) =>
      button.textContent?.includes("Enter World") && !button.disabled,
  );
}

/** Creates the probe character over the wire so the UI only enters world. */
async function ensureCharacterExists(): Promise<void> {
  const socket = new WebSocket(WS_URL);
  const messages: Array<{ type: string; characters?: Array<{ name: string }> }> =
    [];
  socket.onmessage = (event) => {
    const parsed = parseServerMessages(JSON.parse(event.data as string));
    if (parsed) messages.push(...parsed);
  };
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error(`cannot reach ${WS_URL}`));
  });
  const send = (message: unknown) => socket.send(JSON.stringify(message));
  send({ type: "auth", token: TOKEN, language: "en" });
  await waitFor(
    () => messages.find((message) => message.type === "auth-ok"),
    "auth-ok",
    15_000,
  );
  send({
    type: "create-character",
    name: CHARACTER,
    vocation: "Knight",
    sex: "male",
  });
  await waitFor(
    () =>
      messages.find(
        (message) =>
          message.type === "character-list" &&
          message.characters?.some((character) => character.name === CHARACTER),
      ),
    "character creation",
    15_000,
  );
  socket.close();
}

interface WireProbe {
  send(message: unknown): void;
  combatLogTexts: string[];
  sent: string[];
  ownPosition(): Position | null;
}

/** Taps the client's own gameplay socket for sending and observing. */
function instrumentWebSocket(): WireProbe {
  const combatLogTexts: string[] = [];
  const sent: string[] = [];
  let gameplaySocket: WebSocket | null = null;
  let ownPlayerId: string | null = null;
  let ownPosition: Position | null = null;
  const NativeWebSocket = window.WebSocket;
  window.WebSocket = class extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      gameplaySocket = this;
      const nativeSend = this.send.bind(this);
      this.send = (data: Parameters<WebSocket["send"]>[0]) => {
        if (typeof data === "string") {
          try {
            const parsed = JSON.parse(data) as { type?: string } | unknown[];
            for (const message of Array.isArray(parsed) ? parsed : [parsed]) {
              sent.push(JSON.stringify(message));
            }
          } catch {
            // Non-JSON frames are not interesting here.
          }
        }
        nativeSend(data);
      };
      this.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        let json: unknown;
        try {
          json = JSON.parse(event.data);
        } catch {
          return;
        }
        const parsed = parseServerMessages(json);
        if (!parsed) return;
        for (const message of parsed) {
          if (message.type === "welcome") {
            ownPlayerId = message.playerId;
            const own = message.creatures.find(
              (creature) => creature.id === message.playerId,
            );
            if (own) ownPosition = { ...own.position };
          } else if (message.type === "combat-log") {
            combatLogTexts.push(message.text);
          } else if (
            message.type === "creature-moved" &&
            message.creatureId === ownPlayerId
          ) {
            ownPosition = { ...message.position };
          } else if (
            message.type === "position-correction" &&
            message.playerId === ownPlayerId
          ) {
            ownPosition = { ...message.position };
          }
        }
      });
    }
  };
  return {
    send: (message) => {
      if (!gameplaySocket) throw new Error("gameplay socket not open yet");
      gameplaySocket.send(JSON.stringify(message));
    },
    combatLogTexts,
    sent,
    ownPosition: () => ownPosition,
  };
}

/** Right-clicks the canvas at a tile offset from the own (centered) player. */
function rightClickTileOffset(
  canvas: HTMLCanvasElement,
  tilesX: number,
  tilesY: number,
): void {
  const bounds = canvas.getBoundingClientRect();
  const scaleX = bounds.width / canvas.width;
  const scaleY = bounds.height / canvas.height;
  const clientX =
    bounds.left + bounds.width / 2 + tilesX * TILE_PIXELS * scaleX;
  const clientY =
    bounds.top + bounds.height / 2 + tilesY * TILE_PIXELS * scaleY;
  const eventInit = {
    bubbles: true,
    cancelable: true,
    button: 2,
    buttons: 2,
    clientX,
    clientY,
  };
  canvas.dispatchEvent(new MouseEvent("mousedown", eventInit));
  window.dispatchEvent(
    new MouseEvent("mouseup", { ...eventInit, buttons: 0 }),
  );
}

test(
  "right-clicking the cultist key box loots the bone key",
  { timeout: 180_000 },
  async () => {
    await ensureCharacterExists();
    const wire = instrumentWebSocket();

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

      wire.send({
        type: "speak",
        mode: "say",
        text: `/goto ${STAND.x} ${STAND.y} ${STAND.z}`,
      });
      await waitFor(() => {
        const position = wire.ownPosition();
        return position &&
          Math.abs(position.x - STAND.x) <= 1 &&
          Math.abs(position.y - STAND.y) <= 1 &&
          position.z === STAND.z
          ? position
          : null;
      }, "teleport beside the box", 15_000);
      // Let the region textures, any follow-up movement, and the recentered
      // camera settle; the camera centers on the live position, so the click
      // offsets below must be computed from it at click time.
      await sleep(2_000);
      const landed = wire.ownPosition();
      if (!landed) throw new Error("own position unknown after teleport");

      const logSize = wire.combatLogTexts.length;
      const sentSize = wire.sent.length;
      rightClickTileOffset(canvas, BOX.x - landed.x, BOX.y - landed.y);
      try {
        await waitFor(
          () =>
            wire.combatLogTexts
              .slice(logSize)
              .find((text) => text === "You have found a bone key."),
          "the bone key find",
          15_000,
        );
      } catch (error) {
        throw new Error(
          `${String(error)}; landed=${JSON.stringify(
            landed,
          )} live=${JSON.stringify(wire.ownPosition())}; sent since click: [${wire.sent
            .slice(sentSize)
            .join(" ; ")}]; log tail: [${wire.combatLogTexts
            .slice(-3)
            .join(" | ")}]`,
        );
      }

      // The use exhaust is 200 ms; then the gate must answer "empty".
      await sleep(600);
      const secondLogSize = wire.combatLogTexts.length;
      rightClickTileOffset(canvas, BOX.x - landed.x, BOX.y - landed.y);
      const empty = await waitFor(
        () =>
          wire.combatLogTexts
            .slice(secondLogSize)
            .find((text) => text === "The box is empty."),
        "the empty-box reply",
        15_000,
      );
      expect(empty).toBe("The box is empty.");
    } finally {
      root.unmount();
      host.remove();
    }
  },
);
