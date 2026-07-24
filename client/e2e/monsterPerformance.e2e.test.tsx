import {
  clientMessageSchema,
  parseServerMessages,
  type ClientMessage,
  type CreatureState,
  type InventoryItem,
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
const TOKEN = "dev-monster-performance-e2e";
const CHARACTER = "Monster Probe";
const MONSTER_NAME = "Butterfly";
const STAGES = [100, 300, 500, 1_000] as const;
const TEST_POSITION = { x: 32_369, y: 32_260, z: 7 } satisfies Position;
const GREAT_FIREBALL_RUNE_TYPE_ID = 3_191;
const MIN_AVERAGE_FPS = 15;
const MAX_P95_FRAME_MS = 100;

interface FrameMetrics {
  readonly averageFps: number;
  readonly p95FrameMs: number;
  readonly worstFrameMs: number;
  readonly frames: number;
}

interface GmResponse {
  readonly ok: boolean;
  readonly text: string;
}

interface MonsterWireProbe {
  readonly ownPosition: Position | null;
  readonly inventory: InventoryState | null;
  readonly gmResponses: ReadonlyArray<GmResponse>;
  readonly magicEffects: number;
  readonly combatTexts: number;
  readonly monsterHealthUpdates: number;
  readonly monsterDeaths: number;
  readonly errors: ReadonlyArray<string>;
  monsterCount(): number;
  closestMonster(): CreatureState | null;
  findItem(typeId: number): InventoryItem | null;
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

function instrumentWebSocket(): MonsterWireProbe {
  const creatures = new Map<string, CreatureState>();
  const gmResponses: GmResponse[] = [];
  const errors: string[] = [];
  let gameplaySocket: WebSocket | null = null;
  let ownPlayerId: string | null = null;
  let ownPosition: Position | null = null;
  let inventory: InventoryState | null = null;
  let magicEffects = 0;
  let combatTexts = 0;
  let monsterHealthUpdates = 0;
  let monsterDeaths = 0;
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
      if (creatures.get(message.creatureId)?.kind === "monster") {
        monsterDeaths++;
      }
      creatures.delete(message.creatureId);
      return;
    }
    if (message.type === "creature-moved") {
      const creature = creatures.get(message.creatureId);
      if (creature) {
        creatures.set(message.creatureId, {
          ...creature,
          position: message.position,
          positionRevision: message.positionRevision,
          direction: message.direction,
        });
      }
      if (message.creatureId === ownPlayerId) {
        ownPosition = { ...message.position };
      }
      return;
    }
    if (
      message.type === "position-correction" &&
      message.playerId === ownPlayerId
    ) {
      ownPosition = { ...message.position };
      return;
    }
    if (message.type === "inventory-updated") {
      inventory = message.inventory;
      return;
    }
    if (message.type === "gm-response") {
      gmResponses.push({ ok: message.ok, text: message.text });
      return;
    }
    if (message.type === "magic-effect") {
      magicEffects++;
      return;
    }
    if (message.type === "combat-text") {
      combatTexts++;
      return;
    }
    if (
      message.type === "creature-health" &&
      creatures.get(message.creatureId)?.kind === "monster"
    ) {
      monsterHealthUpdates++;
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
    get magicEffects() {
      return magicEffects;
    },
    get combatTexts() {
      return combatTexts;
    },
    get monsterHealthUpdates() {
      return monsterHealthUpdates;
    },
    get monsterDeaths() {
      return monsterDeaths;
    },
    errors,
    monsterCount() {
      return [...creatures.values()].filter(
        (creature) =>
          creature.kind === "monster" && creature.name === MONSTER_NAME,
      ).length;
    },
    closestMonster() {
      if (!ownPosition) return null;
      let closest: CreatureState | null = null;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const creature of creatures.values()) {
        if (creature.kind !== "monster" || creature.name !== MONSTER_NAME) {
          continue;
        }
        const distance = Math.max(
          Math.abs(creature.position.x - ownPosition.x),
          Math.abs(creature.position.y - ownPosition.y),
        );
        if (
          creature.position.z !== ownPosition.z ||
          distance >= closestDistance
        ) {
          continue;
        }
        closest = creature;
        closestDistance = distance;
      }
      return closest;
    },
    findItem(typeId) {
      if (!inventory) return null;
      for (const entry of inventory.items) {
        if (entry.item.typeId === typeId) return entry.item;
      }
      for (const container of inventory.containers ?? []) {
        for (const entry of container.items) {
          if (entry.item.typeId === typeId) return entry.item;
        }
      }
      return null;
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
  wire: MonsterWireProbe,
  command: string,
  acceptedFailurePrefix?: string,
): Promise<GmResponse> {
  const responseIndex = wire.gmResponses.length;
  wire.send({ type: "speak", mode: "say", text: command });
  const response = await waitFor(
    () => wire.gmResponses[responseIndex],
    `GM response for ${command}`,
    30_000,
  );
  if (
    !response.ok &&
    !(
      acceptedFailurePrefix &&
      response.text.startsWith(acceptedFailurePrefix)
    )
  ) {
    throw new Error(`${command}: ${response.text}`);
  }
  return response;
}

function findEnterWorldButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find(
    (button) =>
      button.textContent?.includes("Enter World") && !button.disabled,
  );
}

function measureFrames(durationMs: number): Promise<FrameMetrics> {
  return new Promise((resolve) => {
    const frameTimes: number[] = [];
    const startedAt = performance.now();
    let previous = startedAt;
    const frame = (now: number) => {
      frameTimes.push(now - previous);
      previous = now;
      if (now - startedAt < durationMs) {
        requestAnimationFrame(frame);
        return;
      }
      const sorted = [...frameTimes].sort((left, right) => left - right);
      const elapsed = Math.max(1, now - startedAt);
      resolve({
        averageFps: (frameTimes.length * 1_000) / elapsed,
        p95FrameMs:
          sorted[Math.floor((sorted.length - 1) * 0.95)] ?? elapsed,
        worstFrameMs: sorted.at(-1) ?? elapsed,
        frames: frameTimes.length,
      });
    };
    requestAnimationFrame(frame);
  });
}

async function describeRenderer(canvas: HTMLCanvasElement): Promise<string> {
  const gl =
    canvas.getContext("webgl2") ??
    canvas.getContext("webgl");
  if (gl) {
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debug) return String(gl.getParameter(gl.RENDERER));
    return String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
  }
  const webgpuContext = (
    canvas.getContext as unknown as (contextId: string) => object | null
  )("webgpu");
  if (!webgpuContext) {
    return canvas.getContext("2d") ? "Canvas2D" : "unknown canvas renderer";
  }
  const gpu = (
    navigator as Navigator & {
      readonly gpu?: {
        requestAdapter(options?: {
          readonly powerPreference?: "low-power" | "high-performance";
        }): Promise<{
          readonly info?: {
            readonly vendor?: string;
            readonly architecture?: string;
            readonly device?: string;
            readonly description?: string;
          };
        } | null>;
      };
    }
  ).gpu;
  const adapter = await gpu?.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) return "WebGPU adapter already initialized";
  const details = [
    adapter.info?.vendor,
    adapter.info?.architecture,
    adapter.info?.device,
    adapter.info?.description,
  ].filter((value): value is string => Boolean(value));
  return `WebGPU ${details.join(" ") || "adapter details unavailable"}`;
}

test(
  "renders 1000 monsters and stays responsive while spells and runes kill them",
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
      const canvas = await waitFor(
        () => host.querySelector<HTMLCanvasElement>(
          'canvas[data-tibia-world="true"]',
        ),
        "world canvas",
        60_000,
      );
      const rendererDescription = await describeRenderer(canvas);
      console.log(
        `CLIENT_RENDERER renderer="${rendererDescription}" ` +
          `canvas=${canvas.width}x${canvas.height}`,
      );
      if (import.meta.env.VITE_CLIENT_RENDERER_PROFILE === "hardware") {
        expect
          .soft(
            rendererDescription,
            "hardware profile fell back to a software/canvas renderer",
          )
          .not.toMatch(/Canvas2D|SwiftShader|llvmpipe|software|unknown/i);
      }
      await waitFor(() => wire.ownPosition, "welcome message", 30_000);
      await sleep(10_000);

      await runGmCommand(wire, "/despawn");
      await runGmCommand(
        wire,
        `/goto ${TEST_POSITION.x + 40} ${TEST_POSITION.y} ${TEST_POSITION.z}`,
      );
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
      await runGmCommand(wire, "/level 300", "Already level");
      await runGmCommand(wire, "/magic 30", "Already magic level");
      await runGmCommand(wire, "/heal");
      let rune = wire.findItem(GREAT_FIREBALL_RUNE_TYPE_ID);
      if (!rune) {
        await runGmCommand(wire, "/i great fireball rune 100");
        rune = await waitFor(
          () => wire.findItem(GREAT_FIREBALL_RUNE_TYPE_ID),
          "great fireball rune",
          30_000,
        );
      }

      const emptyMetrics = await measureFrames(3_000);
      console.log(
        `MONSTER_FPS count=0 average=${emptyMetrics.averageFps.toFixed(1)} ` +
          `p95Frame=${emptyMetrics.p95FrameMs.toFixed(1)}ms ` +
          `worstFrame=${emptyMetrics.worstFrameMs.toFixed(1)}ms`,
      );

      const stageMetrics: FrameMetrics[] = [];
      let current = 0;
      for (const target of STAGES) {
        await runGmCommand(wire, `/spawn butterfly ${target - current}`);
        await waitFor(
          () => (wire.monsterCount() === target ? true : false),
          `${target} visible monsters`,
          60_000,
        );
        current = target;
        await sleep(2_000);
        const metrics = await measureFrames(3_000);
        stageMetrics.push(metrics);
        console.log(
          `MONSTER_FPS count=${target} average=${metrics.averageFps.toFixed(1)} ` +
            `p95Frame=${metrics.p95FrameMs.toFixed(1)}ms ` +
            `worstFrame=${metrics.worstFrameMs.toFixed(1)}ms`,
        );
        expect.soft(
          metrics.averageFps,
          `${target}-monster average FPS`,
        ).toBeGreaterThanOrEqual(MIN_AVERAGE_FPS);
        expect.soft(
          metrics.p95FrameMs,
          `${target}-monster p95 frame time`,
        ).toBeLessThanOrEqual(MAX_P95_FRAME_MS);
      }

      const firstFps = stageMetrics[0]?.averageFps ?? 0;
      const thousandFps = stageMetrics.at(-1)?.averageFps ?? 0;
      expect.soft(
        thousandFps,
        "1000-monster FPS collapsed relative to 100 monsters",
      ).toBeGreaterThanOrEqual(firstFps * 0.3);

      const effectsBefore = wire.magicEffects;
      const combatTextsBefore = wire.combatTexts;
      const healthBefore = wire.monsterHealthUpdates;
      const deathsBefore = wire.monsterDeaths;
      const combatFrames = measureFrames(8_000);

      wire.send({ type: "turn", direction: "south" });
      wire.send({
        type: "cast-spell",
        spellId: "exevo-gran-flam-hur",
        target: { kind: "direction" },
      });
      await waitFor(
        () => (wire.monsterDeaths > deathsBefore ? true : false),
        "spell monster deaths",
        10_000,
      );

      await sleep(2_100);
      const runeTarget = wire.closestMonster();
      if (!runeTarget) throw new Error("no live monster remained for rune combat");
      wire.send({
        type: "use-rune",
        itemId: rune.id,
        revision: rune.revision,
        target: { kind: "position", position: runeTarget.position },
      });
      const deathsAfterSpell = wire.monsterDeaths;
      await waitFor(
        () => (wire.monsterDeaths > deathsAfterSpell ? true : false),
        "rune monster deaths",
        10_000,
      );

      await sleep(2_100);
      const attackTarget = wire.closestMonster();
      if (!attackTarget) {
        throw new Error("no live monster remained for auto-attack combat");
      }
      wire.send({ type: "attack-target", creatureId: attackTarget.id });

      const combatMetrics = await combatFrames;
      console.log(
        `MONSTER_COMBAT_FPS remaining=${wire.monsterCount()} ` +
          `deaths=${wire.monsterDeaths - deathsBefore} ` +
          `average=${combatMetrics.averageFps.toFixed(1)} ` +
          `p95Frame=${combatMetrics.p95FrameMs.toFixed(1)}ms ` +
          `worstFrame=${combatMetrics.worstFrameMs.toFixed(1)}ms`,
      );
      expect
        .soft(combatMetrics.averageFps)
        .toBeGreaterThanOrEqual(MIN_AVERAGE_FPS);
      expect
        .soft(combatMetrics.p95FrameMs)
        .toBeLessThanOrEqual(MAX_P95_FRAME_MS);
      expect(wire.magicEffects).toBeGreaterThan(effectsBefore);
      expect(wire.combatTexts).toBeGreaterThan(combatTextsBefore);
      expect(wire.monsterHealthUpdates).toBeGreaterThan(healthBefore);
      expect(wire.monsterDeaths - deathsBefore).toBeGreaterThanOrEqual(2);
      expect(wire.errors, "server rejected a combat or fixture intent").toEqual(
        [],
      );
    } finally {
      await runGmCommand(wire, "/despawn").catch(() => undefined);
      root.unmount();
      host.remove();
      wire.restore();
    }
  },
);
