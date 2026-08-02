import {
  clientMessageSchema,
  parseServerMessages,
  type ClientMessage,
  type CreatureState,
  type InventoryState,
  type Position,
  type ServerMessage,
} from "@tibia/protocol";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import GameWindow from "../components/GameWindow";
import "../i18n/i18n";

const WS_URL =
  import.meta.env.VITE_PLAYTEST_WS_URL ?? "ws://127.0.0.1:4124";
const TOKEN = "dev-inventory-performance-e2e";
const CHARACTER = "Inventory Probe";
/** Given tolerantly — a name the catalog cannot resolve is skipped. */
const BACKPACK_ITEMS = [
  "rope",
  "shovel",
  "torch",
  "sword",
  "mace",
  "axe",
  "plate armor",
  "plate legs",
  "steel shield",
  "apple",
  "health potion",
  "mana potion",
  "great fireball rune",
  "gold coin 100",
] as const;
const MIN_BACKPACK_ITEMS = 8;
const MAX_P95_FRAME_MS = 100;
const MONSTER_NAME = "Butterfly";
const MONSTER_COUNT = 300;
/** The monster-capacity probe's open ground, away from protection zones. */
const TEST_POSITION = { x: 32_369, y: 32_260, z: 7 } satisfies Position;

interface StageMetrics {
  readonly averageFps: number;
  readonly p95FrameMs: number;
  readonly worstFrameMs: number;
  readonly frames: number;
  readonly longTasks: number;
  readonly blockedMs: number;
}

interface GmResponse {
  readonly ok: boolean;
  readonly text: string;
}

interface InventoryWireProbe {
  readonly ownPosition: Position | null;
  readonly inventory: InventoryState | null;
  readonly gmResponses: ReadonlyArray<GmResponse>;
  readonly errors: ReadonlyArray<string>;
  backpackItemCount(): number;
  monsterCount(): number;
  send(message: ClientMessage): void;
  restore(): void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(
  find: () => T | null | undefined | false,
  label: string,
  timeoutMs = 30_000,
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

async function ensureCharacterExists(): Promise<void> {
  const socket = new WebSocket(WS_URL);
  const messages: Array<{
    type: string;
    characters?: Array<{ name: string }>;
  }> = [];
  socket.onmessage = (event) => {
    const parsed = parseServerMessages(JSON.parse(event.data as string));
    if (parsed) messages.push(...parsed);
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
      vocation: "Sorcerer",
      sex: "male",
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

function instrumentWebSocket(): InventoryWireProbe {
  const gmResponses: GmResponse[] = [];
  const errors: string[] = [];
  const creatures = new Map<string, CreatureState>();
  let gameplaySocket: WebSocket | null = null;
  let ownPlayerId: string | null = null;
  let ownPosition: Position | null = null;
  let inventory: InventoryState | null = null;
  const NativeWebSocket = window.WebSocket;

  const receive = (message: ServerMessage) => {
    if (message.type === "welcome") {
      ownPlayerId = message.playerId;
      ownPosition = { ...message.character.position };
      inventory = message.inventory;
      for (const creature of message.creatures) {
        creatures.set(creature.id, creature);
      }
      return;
    }
    if (message.type === "creature-joined") {
      creatures.set(message.creature.id, message.creature);
      return;
    }
    if (message.type === "creature-state-changed") {
      creatures.set(message.creature.id, message.creature);
      return;
    }
    if (message.type === "creature-left") {
      creatures.delete(message.creatureId);
      return;
    }
    if (message.type === "inventory-updated") {
      inventory = message.inventory;
      return;
    }
    if (
      message.type === "creature-moved" &&
      message.creatureId === ownPlayerId
    ) {
      ownPosition = { ...message.position };
      return;
    }
    if (
      message.type === "position-correction" &&
      message.playerId === ownPlayerId
    ) {
      ownPosition = { ...message.position };
      return;
    }
    if (message.type === "gm-response") {
      gmResponses.push({ ok: message.ok, text: message.text });
      return;
    }
    if (message.type === "error") errors.push(message.code);
  };

  const rememberGameplaySocket = (socket: WebSocket) => {
    gameplaySocket = socket;
  };
  window.WebSocket = class extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      rememberGameplaySocket(this);
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
        for (const message of parsed) receive(message);
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
        if (json !== null && !clientMessageSchema.safeParse(json).success) {
          throw new Error("browser tried to send an invalid protocol message");
        }
      }
      super.send(data);
    }
  };

  return {
    get ownPosition() {
      return ownPosition;
    },
    get inventory() {
      return inventory;
    },
    gmResponses,
    errors,
    backpackItemCount() {
      return inventory?.items.length ?? 0;
    },
    monsterCount() {
      return [...creatures.values()].filter(
        (creature) =>
          creature.kind === "monster" && creature.name === MONSTER_NAME,
      ).length;
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

async function runGmCommand(
  wire: InventoryWireProbe,
  command: string,
): Promise<GmResponse> {
  const responseIndex = wire.gmResponses.length;
  wire.send({ type: "speak", mode: "say", text: command });
  return waitFor(
    () => wire.gmResponses[responseIndex],
    `GM response for ${command}`,
    30_000,
  );
}

function findEnterWorldButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find(
    (button) =>
      button.textContent?.includes("Enter World") && !button.disabled,
  );
}

function findInventoryButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((button) =>
    button.getAttribute("aria-label")?.startsWith("Inventory"),
  );
}

/**
 * Frame cadence plus main-thread long tasks for one stage. Long tasks split
 * scripting/style jank from raster jank: a slow stage without long tasks is
 * paint-bound, not React-bound.
 */
function measureStage(durationMs: number): Promise<StageMetrics> {
  return new Promise((resolve) => {
    const frameTimes: number[] = [];
    let longTasks = 0;
    let blockedMs = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks++;
        blockedMs += entry.duration;
      }
    });
    try {
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      // long task timing is Chromium-only; frame metrics alone still stand
    }
    const startedAt = performance.now();
    let previous = startedAt;
    const frame = (now: number) => {
      frameTimes.push(now - previous);
      previous = now;
      if (now - startedAt < durationMs) {
        requestAnimationFrame(frame);
        return;
      }
      observer.disconnect();
      const sorted = [...frameTimes].sort((left, right) => left - right);
      const elapsed = Math.max(1, now - startedAt);
      resolve({
        averageFps: (frameTimes.length * 1_000) / elapsed,
        p95FrameMs:
          sorted[Math.floor((sorted.length - 1) * 0.95)] ?? elapsed,
        worstFrameMs: sorted.at(-1) ?? elapsed,
        frames: frameTimes.length,
        longTasks,
        blockedMs,
      });
    };
    requestAnimationFrame(frame);
  });
}

function logStage(stage: string, metrics: StageMetrics): void {
  console.log(
    `INVENTORY_FPS stage=${stage} average=${metrics.averageFps.toFixed(1)} ` +
      `p95Frame=${metrics.p95FrameMs.toFixed(1)}ms ` +
      `worstFrame=${metrics.worstFrameMs.toFixed(1)}ms ` +
      `longTasks=${metrics.longTasks} blocked=${metrics.blockedMs.toFixed(0)}ms`,
  );
}

/** Oscillates held movement so own-character state churns like real play. */
function startWalking(wire: InventoryWireProbe): () => void {
  let east = true;
  wire.send({ type: "move", direction: "east", queueStep: true });
  const timer = setInterval(() => {
    east = !east;
    wire.send({
      type: "move",
      direction: east ? "east" : "west",
      queueStep: true,
    });
  }, 600);
  return () => {
    clearInterval(timer);
    wire.send({ type: "stop-move" });
  };
}

test(
  "keeps the world responsive while the inventory panel is open",
  { timeout: 300_000 },
  async () => {
    await ensureCharacterExists();
    const wire = instrumentWebSocket();
    const host = document.createElement("div");
    host.style.width = "1280px";
    host.style.height = "720px";
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
        () => host.querySelector<HTMLCanvasElement>(
          'canvas[data-tibia-world="true"]',
        ),
        "world canvas",
        60_000,
      );
      await waitFor(() => wire.ownPosition, "welcome message", 30_000);

      // The HUD counter must render and its ping must fill from a real pong.
      const counter = await waitFor(
        () =>
          document.querySelector(
            '[aria-label="Frame rate and server latency"]',
          ),
        "fps/ping counter",
        15_000,
      );
      await waitFor(
        () => /\d+ ms/.test(counter.textContent ?? ""),
        "ping round trip in the counter",
        15_000,
      );

      // Let asset loads and the first-render burst settle before measuring.
      await sleep(10_000);

      for (const item of BACKPACK_ITEMS) {
        if (wire.backpackItemCount() >= BACKPACK_ITEMS.length) break;
        await runGmCommand(wire, `/i ${item}`);
      }
      expect(
        wire.backpackItemCount(),
        "backpack items for the perf scenario",
      ).toBeGreaterThanOrEqual(MIN_BACKPACK_ITEMS);

      await runGmCommand(wire, "/despawn");
      await runGmCommand(
        wire,
        `/goto ${TEST_POSITION.x} ${TEST_POSITION.y} ${TEST_POSITION.z}`,
      );
      await waitFor(
        () =>
          wire.ownPosition?.x === TEST_POSITION.x &&
          wire.ownPosition.y === TEST_POSITION.y &&
          wire.ownPosition.z === TEST_POSITION.z,
        "performance-test position",
        15_000,
      );
      wire.send({ type: "set-viewport", range: { x: 32, y: 24 } });

      const standingClosed = await measureStage(3_000);
      logStage("standing-closed", standingClosed);

      let stopWalking = startWalking(wire);
      await sleep(500);
      const walkingClosed = await measureStage(4_000);
      stopWalking();
      logStage("walking-closed", walkingClosed);

      await runGmCommand(wire, `/spawn butterfly ${MONSTER_COUNT}`);
      await waitFor(
        () => (wire.monsterCount() >= MONSTER_COUNT ? true : false),
        `${MONSTER_COUNT} visible monsters`,
        60_000,
      );
      await sleep(2_000);
      const monstersClosed = await measureStage(4_000);
      logStage("monsters-closed", monstersClosed);

      const inventoryButton = await waitFor(
        findInventoryButton,
        "Inventory navigation button",
        10_000,
      );
      inventoryButton.click();
      // Measured from the click so the panel's first paint jank is captured.
      const opening = await measureStage(2_000);
      logStage("opening", opening);
      await waitFor(
        () =>
          document.querySelector(
            `section[aria-label="${CHARACTER}'s inventory"]`,
          ),
        "inventory panel",
        10_000,
      );

      const monstersOpen = await measureStage(4_000);
      logStage("monsters-open", monstersOpen);

      stopWalking = startWalking(wire);
      await sleep(500);
      const walkingMonstersOpen = await measureStage(4_000);
      stopWalking();
      logStage("walking-monsters-open", walkingMonstersOpen);

      const statsToggle = document.querySelector<HTMLButtonElement>(
        'button[aria-controls="character-stats-panel"]',
      );
      if (statsToggle) {
        statsToggle.click();
        await sleep(500);
        stopWalking = startWalking(wire);
        await sleep(500);
        const walkingOpenStats = await measureStage(4_000);
        stopWalking();
        logStage("walking-monsters-open-stats", walkingOpenStats);
      }

      // The panel may cost something; it must not halve the frame rate.
      expect.soft(
        monstersOpen.averageFps,
        "open-inventory FPS vs closed under monster load",
      ).toBeGreaterThanOrEqual(monstersClosed.averageFps * 0.5);
      expect.soft(
        walkingMonstersOpen.averageFps,
        "open-inventory walking FPS vs closed under monster load",
      ).toBeGreaterThanOrEqual(monstersClosed.averageFps * 0.5);
    } finally {
      await runGmCommand(wire, "/despawn").catch(() => undefined);
      // Leave the shared probe ground: the monster-capacity test teleports
      // onto this exact tile, and the playtest world persists characters.
      await runGmCommand(
        wire,
        `/goto ${TEST_POSITION.x + 40} ${TEST_POSITION.y} ${TEST_POSITION.z}`,
      ).catch(() => undefined);
      root.unmount();
      host.remove();
      wire.restore();
    }
  },
);
