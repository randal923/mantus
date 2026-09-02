import { expect, test } from "vitest";
import { createRoot } from "react-dom/client";
import {
  parseServerMessages,
  type InventoryItem,
  type InventoryState,
  type Position,
} from "@tibia/protocol";
import "../i18n/i18n";
import GameWindow from "../components/GameWindow";

/**
 * Regression for a player report: supplies that sit inside a container the
 * client has not opened (the loot pouch after a hunt, a bag inside the
 * backpack) are listed in the depot window's "Carried Items", but pressing
 * "Store" on them fails with "The depot could not complete that action."
 * every time. The whole flow runs through the real GameWindow against the
 * real server: the potions are moved into the closed container over the
 * wire, the depot chest is opened with a right-click, and the Store button
 * is clicked the way the player did.
 */
const WS_URL = "ws://127.0.0.1:4124";
// The e2e database persists between runs and an account holds a bounded
// character list, so every run brings fresh tokens and letters-only names.
// Each test gets its own account: the Enter World button picks the account's
// first character, so two probes on one account would share a body.
const RUN_SUFFIX = [...String(Date.now() % 1_000_000)]
  .map((digit) => "Abcdefghij"[Number(digit)])
  .join("");
const tokenFor = (probe: string) =>
  `dev-depot-e2e-${probe}-${RUN_SUFFIX.toLowerCase()}`;
/** Thais depot: a chest with a walkable tile directly south of it. */
const CHEST = { x: 32_352, y: 32_225, z: 7 } satisfies Position;
const STAND = { x: 32_352, y: 32_226, z: 7 } satisfies Position;
const HEALTH_POTION_TYPE_ID = 266;
const LOOT_POUCH_TYPE_ID = 23_721;
const BAG_TYPE_ID = 2_853;
/** World pixels per tile at the renderer's zoom (TILE_SIZE 32 × ZOOM 3). */
const TILE_PIXELS = 96;
const SETTLE_MS = 6_000;
const DEPOSIT_FAILED_TEXT = "The depot could not complete that action.";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(
  find: () => T | null | undefined | false,
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
async function ensureCharacterExists(
  token: string,
  name: string,
): Promise<void> {
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
  send({ type: "auth", token, language: "en" });
  await waitFor(
    () => messages.find((message) => message.type === "auth-ok"),
    "auth-ok",
    15_000,
  );
  send({ type: "create-character", name, vocation: "Knight", sex: "male" });
  await waitFor(
    () =>
      messages.find(
        (message) =>
          message.type === "character-list" &&
          message.characters?.some((character) => character.name === name),
      ),
    "character creation",
    15_000,
  );
  socket.close();
}

interface DepotStateSeen {
  readonly depotCount: number;
  readonly carriedNames: ReadonlyArray<string>;
}

interface WireProbe {
  send(message: unknown): void;
  sent: string[];
  gmReplies: string[];
  depotStates: DepotStateSeen[];
  depotFailures: string[];
  inventory(): InventoryState | null;
  ownPosition(): Position | null;
}

/** Taps the client's own gameplay socket for sending and observing. */
function instrumentWebSocket(): WireProbe {
  const sent: string[] = [];
  const gmReplies: string[] = [];
  const depotStates: DepotStateSeen[] = [];
  const depotFailures: string[] = [];
  let gameplaySocket: WebSocket | null = null;
  let ownPlayerId: string | null = null;
  let ownPosition: Position | null = null;
  let inventory: InventoryState | null = null;
  const track = (socket: WebSocket) => {
    gameplaySocket = socket;
  };
  const NativeWebSocket = window.WebSocket;
  window.WebSocket = class extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      track(this);
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
            inventory = message.inventory;
          } else if (message.type === "inventory-updated") {
            inventory = message.inventory;
          } else if (message.type === "gm-response") {
            gmReplies.push(`${message.ok ? "ok" : "error"}: ${message.text}`);
          } else if (message.type === "depot-state") {
            depotStates.push({
              depotCount: message.depotCount,
              carriedNames: message.carriedItems.map(({ item }) => item.name),
            });
          } else if (message.type === "depot-action-failed") {
            depotFailures.push(message.reason);
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
    sent,
    gmReplies,
    depotStates,
    depotFailures,
    inventory: () => inventory,
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

function backpackItemOfType(
  inventory: InventoryState | null,
  typeId: number,
): InventoryItem | null {
  return (
    inventory?.items.find((entry) => entry.item.typeId === typeId)?.item ??
    null
  );
}

function openContainerItemOfType(
  inventory: InventoryState | null,
  typeId: number,
): InventoryItem | null {
  for (const container of inventory?.containers ?? []) {
    const entry = container.items.find((item) => item.item.typeId === typeId);
    if (entry) return entry.item;
  }
  return null;
}

/** The depot window's "Store" button on the carried row naming `itemName`. */
function findStoreButton(itemName: string): HTMLButtonElement | undefined {
  const rows = [...document.querySelectorAll("li")].filter((row) =>
    row.textContent?.includes(itemName),
  );
  for (const row of rows) {
    const button = [...row.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Store",
    );
    if (button) return button;
  }
  return undefined;
}

function depotAlertText(): string | null {
  const alert = document.querySelector('[role="alert"]');
  return alert?.textContent?.trim() || null;
}

interface WorldSession {
  readonly wire: WireProbe;
  readonly canvas: HTMLCanvasElement;
  readonly landed: Position;
  readonly teardown: () => void;
}

/** Mounts the real client, enters world, and stands south of the chest. */
async function enterWorldAtDepot(
  token: string,
  character: string,
): Promise<WorldSession> {
  await ensureCharacterExists(token, character);
  const wire = instrumentWebSocket();
  const host = document.createElement("div");
  host.style.width = "1024px";
  host.style.height = "640px";
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<GameWindow accessToken={token} onLogout={async () => {}} />);
  const teardown = () => {
    root.unmount();
    host.remove();
  };
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
    await waitFor(() => wire.inventory(), "the login inventory", 30_000);
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
    }, "teleport beside the depot chest", 15_000);
    // Let region textures and the recentered camera settle; click offsets
    // are computed from the live position at click time.
    await sleep(2_000);
    const landed = wire.ownPosition();
    if (!landed) throw new Error("own position unknown after teleport");
    return { wire, canvas, landed, teardown };
  } catch (error) {
    teardown();
    throw error;
  }
}

/**
 * Moves the starter health potions into `destination` over the wire (the
 * same intent a drag sends) and waits until they have left the backpack
 * grid, i.e. the client can no longer see them in any open container.
 */
async function movePotionsInto(
  wire: WireProbe,
  destination: InventoryItem,
): Promise<void> {
  const potions = backpackItemOfType(wire.inventory(), HEALTH_POTION_TYPE_ID);
  if (!potions) throw new Error("starter health potions not in the backpack");
  const sentSize = wire.sent.length;
  wire.send({
    type: "move-item",
    itemId: potions.id,
    revision: potions.revision,
    destinationContainerId: destination.id,
    destinationRevision: destination.revision,
    destinationSlot: 0,
  });
  await waitFor(
    () => {
      const inventory = wire.inventory();
      return (
        inventory !== null &&
        backpackItemOfType(inventory, HEALTH_POTION_TYPE_ID) === null &&
        inventory.carried?.some(
          (summary) => summary.typeId === HEALTH_POTION_TYPE_ID,
        ) === true
      );
    },
    `the potions to move into ${destination.name} (sent: ${wire.sent
      .slice(sentSize)
      .join(" ; ")})`,
    15_000,
  );
}

/** Opens the depot with a right-click and stores the health potions. */
async function storePotionsThroughDepotWindow(
  session: WorldSession,
): Promise<void> {
  const { wire, canvas, landed } = session;
  const statesBefore = wire.depotStates.length;
  rightClickTileOffset(canvas, CHEST.x - landed.x, CHEST.y - landed.y);
  await waitFor(
    () => wire.depotStates.length > statesBefore,
    `the depot window to open (landed=${JSON.stringify(landed)}, gm: ${wire.gmReplies.join(" | ")})`,
    15_000,
  );
  const opened = wire.depotStates[wire.depotStates.length - 1]!;
  expect(opened.depotCount).toBe(0);
  expect(opened.carriedNames).toContain("health potion");

  const store = await waitFor(
    () => findStoreButton("health potion"),
    "the Store button on the health potion row",
    15_000,
  );
  const statesAtClick = wire.depotStates.length;
  const sentAtClick = wire.sent.length;
  store.click();

  await waitFor(
    () =>
      wire.depotStates.length > statesAtClick ||
      wire.depotFailures.length > 0 ||
      depotAlertText() !== null,
    "the depot to answer the Store click",
    15_000,
  );
  await sleep(500);
  const alert = depotAlertText();
  const deposits = wire.sent
    .slice(sentAtClick)
    .filter((message) => message.includes('"depot-deposit"'));
  const latest = wire.depotStates[wire.depotStates.length - 1]!;
  const detail = `alert=${JSON.stringify(alert)}; deposit intents sent=${deposits.length}; server failures=[${wire.depotFailures.join(",")}]; depotCount=${latest.depotCount}`;
  expect(alert, `Store must not fail locally (${detail})`).not.toBe(
    DEPOSIT_FAILED_TEXT,
  );
  expect(deposits.length, `a depot-deposit intent must be sent (${detail})`)
    .toBeGreaterThan(0);
  expect(latest.depotCount, `the potions must land in the depot (${detail})`)
    .toBe(1);
}

test(
  "storing potions that sit in the closed loot pouch",
  { timeout: 180_000 },
  async () => {
    const session = await enterWorldAtDepot(
      tokenFor("pouch"),
      `Pouch Probe ${RUN_SUFFIX}`,
    );
    const { wire } = session;
    try {
      // Open the bound root just long enough to learn the pouch's id and
      // revision, then close it again: the pouch itself stays closed, which
      // is how a player arrives at the depot after a hunt with auto-loot.
      const bound = wire.inventory()?.equipment.bound;
      if (!bound) throw new Error("starter bound container missing");
      wire.send({ type: "open-container", itemId: bound.id, revision: bound.revision });
      const pouch = await waitFor(
        () => openContainerItemOfType(wire.inventory(), LOOT_POUCH_TYPE_ID),
        "the loot pouch inside the bound container",
        15_000,
      );
      await movePotionsInto(wire, pouch);
      wire.send({ type: "close-container", containerId: bound.id });
      await waitFor(
        () =>
          !(wire.inventory()?.containers ?? []).some(
            (container) => container.container.id === bound.id,
          ),
        "the bound container to close",
        15_000,
      );

      await storePotionsThroughDepotWindow(session);
    } finally {
      session.teardown();
    }
  },
);

test(
  "storing potions that sit in a closed bag inside the backpack",
  { timeout: 180_000 },
  async () => {
    const session = await enterWorldAtDepot(
      tokenFor("bag"),
      `Bag Probe ${RUN_SUFFIX}`,
    );
    const { wire } = session;
    try {
      wire.send({ type: "speak", mode: "say", text: `/i ${BAG_TYPE_ID}` });
      const bag = await waitFor(
        () => backpackItemOfType(wire.inventory(), BAG_TYPE_ID),
        `a bag in the backpack (gm: ${wire.gmReplies.join(" | ")})`,
        15_000,
      );
      await movePotionsInto(wire, bag);

      await storePotionsThroughDepotWindow(session);
    } finally {
      session.teardown();
    }
  },
);

test(
  "storing potions from the open backpack works (harness control)",
  { timeout: 180_000 },
  async () => {
    const session = await enterWorldAtDepot(
      tokenFor("grid"),
      `Grid Probe ${RUN_SUFFIX}`,
    );
    try {
      // The starter potions sit in the backpack grid, which the client always
      // sees, so this is the path the player report says still worked.
      await storePotionsThroughDepotWindow(session);
    } finally {
      session.teardown();
    }
  },
);
