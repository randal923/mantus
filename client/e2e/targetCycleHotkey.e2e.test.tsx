import {
  parseServerMessages,
  type ClientMessage,
  type CreatureState,
  type Position,
  type ServerMessage,
} from "@tibia/protocol";
import { createRoot } from "react-dom/client";
import { expect, test } from "vitest";
import GameWindow from "../components/GameWindow";
import "../i18n/i18n";

const WS_URL =
  import.meta.env.VITE_PLAYTEST_WS_URL ?? "ws://127.0.0.1:4124";
const TOKEN = "dev-target-cycle-e2e";
const CHARACTER = "Cycle Probe";
// Sturdy enough that a level-300 knight's fists do not kill one mid-test.
const MONSTER_NAME = "Dragon";
const TEST_POSITION = { x: 32_369, y: 32_260, z: 7 } satisfies Position;

interface GmResponse {
  readonly ok: boolean;
  readonly text: string;
}

interface CycleWireProbe {
  readonly ownPosition: Position | null;
  readonly attackTargetId: string | null;
  /** Every attack-target-changed id in arrival order (null = cleared). */
  readonly confirmedTargets: ReadonlyArray<string | null>;
  readonly gmResponses: ReadonlyArray<GmResponse>;
  readonly sentAttackTargets: ReadonlyArray<string>;
  readonly errors: ReadonlyArray<string>;
  readonly receivedTypes: ReadonlyArray<string>;
  monsters(): CreatureState[];
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
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(50);
  }
}

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
  const nextMessage = (type: string) =>
    waitFor(() => messages.find((m) => m.type === type), `${type} message`, 15_000);
  send({ type: "auth", token: TOKEN, language: "en" });
  await nextMessage("auth-ok");
  send({ type: "list-characters" });
  const list = await nextMessage("character-list");
  if (!list.characters?.some((character) => character.name === CHARACTER)) {
    send({ type: "create-character", name: CHARACTER, vocation: "Knight", sex: "male" });
    await waitFor(
      () =>
        messages.find(
          (m) =>
            m.type === "character-list" &&
            m.characters?.some((character) => character.name === CHARACTER),
        ),
      "character creation",
      15_000,
    );
  }
  socket.close();
}

function instrumentWebSocket(): CycleWireProbe {
  const creatures = new Map<string, CreatureState>();
  const gmResponses: GmResponse[] = [];
  const sentAttackTargets: string[] = [];
  const errors: string[] = [];
  const receivedTypes: string[] = [];
  let gameplaySocket: WebSocket | null = null;
  let ownPlayerId: string | null = null;
  let ownPosition: Position | null = null;
  let attackTargetId: string | null = null;
  const confirmedTargets: Array<string | null> = [];
  const NativeWebSocket = window.WebSocket;

  const receive = (message: ServerMessage) => {
    receivedTypes.push(message.type);
    if (message.type === "welcome") {
      ownPlayerId = message.playerId;
      ownPosition = { ...message.character.position };
      for (const creature of message.creatures) creatures.set(creature.id, creature);
      return;
    }
    if (message.type === "creature-joined" || message.type === "creature-state-changed") {
      creatures.set(message.creature.id, message.creature);
      return;
    }
    if (message.type === "creature-left") {
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
      if (message.creatureId === ownPlayerId) ownPosition = { ...message.position };
      return;
    }
    if (message.type === "position-correction" && message.playerId === ownPlayerId) {
      ownPosition = { ...message.position };
      return;
    }
    if (message.type === "attack-target-changed") {
      attackTargetId = message.creatureId;
      confirmedTargets.push(message.creatureId);
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
        try {
          const json = JSON.parse(data) as { type?: string; creatureId?: string };
          if (json.type === "attack-target" && typeof json.creatureId === "string") {
            sentAttackTargets.push(json.creatureId);
          }
        } catch {
          // not JSON; let the socket reject it
        }
      }
      super.send(data);
    }
  };

  return {
    get ownPosition() {
      return ownPosition;
    },
    get attackTargetId() {
      return attackTargetId;
    },
    confirmedTargets,
    gmResponses,
    sentAttackTargets,
    errors,
    receivedTypes,
    monsters() {
      return [...creatures.values()].filter(
        (creature) => creature.kind === "monster" && creature.name === MONSTER_NAME,
      );
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
  wire: CycleWireProbe,
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
  if (!response.ok && !(acceptedFailurePrefix && response.text.startsWith(acceptedFailurePrefix))) {
    throw new Error(`${command}: ${response.text}`);
  }
  return response;
}

function findEnterWorldButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find(
    (button) => button.textContent?.includes("Enter World") && !button.disabled,
  );
}

function pressKey(code: string, shiftKey = false): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, shiftKey, bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent("keyup", { code, shiftKey, bubbles: true }));
}

async function pressAndAwaitTarget(
  wire: CycleWireProbe,
  code: string,
  shiftKey: boolean,
): Promise<string> {
  const sentBefore = wire.sentAttackTargets.length;
  const confirmedBefore = wire.confirmedTargets.length;
  const receivedBefore = wire.receivedTypes.length;
  pressKey(code, shiftKey);
  const sent = await waitFor(
    () => wire.sentAttackTargets[sentBefore],
    `${shiftKey ? "Shift+" : ""}${code} to send an attack-target intent`,
    5_000,
  );
  await waitFor(
    () => wire.confirmedTargets.slice(confirmedBefore).includes(sent),
    `server to confirm the target ${sent}`,
    5_000,
  ).catch((cause: Error) => {
    throw new Error(
      `${cause.message}; errors ${JSON.stringify(wire.errors)}, received since press: ${wire.receivedTypes.slice(receivedBefore).join(",")}`,
    );
  });
  return sent;
}

test(
  "Tab and Shift+Tab cycle the attack target through the visible monsters",
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
      const enterWorld = await waitFor(findEnterWorldButton, "Enter World button", 60_000);
      enterWorld.click();
      await waitFor(
        () => host.querySelector<HTMLCanvasElement>('canvas[data-tibia-world="true"]'),
        "world canvas",
        60_000,
      );
      await waitFor(() => wire.ownPosition, "welcome message", 30_000);
      await sleep(3_000);

      // With no monster in view the key is inert: nothing is sent.
      await runGmCommand(wire, "/despawn");
      // Two hops: a /goto onto the tile the player already stands on lands on
      // the nearest free tile instead, so leave first and come back.
      await runGmCommand(wire, `/goto ${TEST_POSITION.x + 40} ${TEST_POSITION.y} ${TEST_POSITION.z}`);
      await runGmCommand(wire, `/goto ${TEST_POSITION.x} ${TEST_POSITION.y} ${TEST_POSITION.z}`);
      await waitFor(
        () =>
          wire.ownPosition?.x === TEST_POSITION.x &&
          wire.ownPosition.y === TEST_POSITION.y,
        "test position",
        15_000,
      );
      await runGmCommand(wire, "/level 300", "Already level");
      await runGmCommand(wire, "/heal");
      await sleep(500);
      pressKey("Tab");
      await sleep(500);
      expect(wire.sentAttackTargets).toEqual([]);

      await runGmCommand(wire, `/spawn ${MONSTER_NAME.toLowerCase()} 2`);
      await waitFor(() => (wire.monsters().length === 2 ? true : false), "two dragons in view", 30_000);
      await sleep(500);
      const ids = new Set(wire.monsters().map((monster) => monster.id));

      // Tab picks a dragon; the next Tab the other one; Shift+Tab walks back.
      const first = await pressAndAwaitTarget(wire, "Tab", false);
      expect(ids.has(first)).toBe(true);
      await sleep(300);
      const second = await pressAndAwaitTarget(wire, "Tab", false);
      expect(ids.has(second)).toBe(true);
      expect(second).not.toBe(first);
      await sleep(300);
      const back = await pressAndAwaitTarget(wire, "Tab", true);
      expect(back).toBe(first);

      // A chat input keeps Tab for itself.
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();
      const sentBefore = wire.sentAttackTargets.length;
      input.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab", bubbles: true, cancelable: true }));
      await sleep(300);
      expect(wire.sentAttackTargets.length).toBe(sentBefore);
      input.remove();

      expect(wire.errors, "server rejected a target or fixture intent").toEqual([]);
    } finally {
      await runGmCommand(wire, "/despawn").catch(() => undefined);
      root.unmount();
      host.remove();
      wire.restore();
    }
  },
);
