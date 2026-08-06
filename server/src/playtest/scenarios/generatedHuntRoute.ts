import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Position, ServerMessage } from "@tibia/protocol";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: take a hunt the generator wrote — not a hand-placed test ring —
 * seed the bot with it exactly as the Hunt Finder does, and watch the
 * character walk the cave and fight what lives there.
 *
 * The unit gate proves each leg is solvable on paper; this proves the cave is
 * a real, populated, enterable place with a live server in it.
 * Run with: yarn playtest:generated-hunt
 */
const TOKEN = "dev-generated-hunt-scenario";
// One fixed character, reused every run: the playtest database persists, and
// a fresh name per run fills the account's character slots.
const CHARACTER = "Ringer Probe";
const HUNT = process.env.PLAYTEST_HUNT ?? "Darashia Rotworm Cave North";
const WATCH_MS = 45_000;

interface HuntingPlace {
  readonly Name: string;
  readonly Generated?: boolean;
  readonly RoutePath: {
    readonly Coordinates: Readonly<
      Record<string, ReadonlyArray<readonly [Position, Position]>>
    >;
  };
}

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const chebyshev = (from: Position, to: Position) =>
  Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));

const isType = <T extends ServerMessage["type"]>(type: T) =>
  (message: ServerMessage): message is Extract<ServerMessage, { type: T }> =>
    message.type === type;

const places = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../../client/public/assets/hunting/hunting_places.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as ReadonlyArray<HuntingPlace>;

const place = places.find((candidate) => candidate.Name === HUNT);
if (!place?.Generated) {
  throw new Error(`"${HUNT}" is not a generated hunt in the catalog`);
}

// The floor the Hunt Finder would seed from: the lowest one the guide covers.
const floor = Object.keys(place.RoutePath.Coordinates)
  .map(Number)
  .sort((left, right) => left - right)[0]!;
const waypoints: Position[] = [];
for (const [start] of place.RoutePath.Coordinates[String(floor)] ?? []) {
  waypoints.push({ x: start.x, y: start.y, z: start.z });
}

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl
  ? null
  : await startPlaytestServer({ log: process.env.PLAYTEST_LOG === "1" });
const url = externalUrl ?? server!.url;
let failed = false;

try {
  step(`connecting to ${url} as ${CHARACTER}`);
  const client = await PlaytestClient.connect(url);
  await client.enter(TOKEN, CHARACTER);
  ok(`entered world as ${client.playerId}`);

  step("boosting the character so a rotworm cave is survivable");
  client.say("/level 200");
  await client.waitFor(isType("gm-response"), "gm-response for /level");

  step("saving the generated ring as the character's route");
  const saveMark = client.mark();
  client.send({
    type: "update-hunting-bot-route",
    route: { huntName: HUNT.slice(0, 64), waypoints },
  });
  const saved = await client.waitFor(
    isType("hunting-bot-route"),
    "hunting-bot-route echo",
    { since: saveMark },
  );
  if (saved.route.waypoints.length !== waypoints.length) {
    throw new Error("the server stored a different route than it was sent");
  }
  ok(`server stored ${saved.route.waypoints.length} waypoints (floor ${floor})`);

  // A creature standing on the tile pushes /goto to a neighbour, which in a
  // cave can be a pocket with no walk back to the route, so the entry tile is
  // whichever of the first few waypoints the bot will actually arm from.
  step(`walking into "${HUNT}" and arming the bot`);
  let armedAt: number | null = null;
  for (const entry of [...waypoints.slice(0, 8), ...waypoints.slice(0, 8)]) {
    const gotoMark = client.mark();
    client.say(`/goto ${entry.x} ${entry.y} ${entry.z}`);
    const gotoReply = await client.waitFor(
      isType("gm-response"),
      "gm-response for /goto",
      { since: gotoMark },
    );
    if (!gotoReply.ok) throw new Error(`/goto failed: ${gotoReply.text}`);
    const armMark = client.mark();
    client.send({ type: "set-hunting-bot-enabled", enabled: true });
    const armed = await client.waitFor(
      (message): message is Extract<
        ServerMessage,
        { type: "hunting-bot-status" | "error" }
      > => message.type === "hunting-bot-status" || message.type === "error",
      "hunting-bot-status",
      { since: armMark },
    );
    if (armed.type === "hunting-bot-status" && armed.enabled) {
      armedAt = armed.waypointIndex + 1;
      ok(`${gotoReply.text} armed at waypoint ${armedAt}`);
      break;
    }
    // Arming needs a clear walk to the route, and a cave this crowded can
    // have a rotworm standing in the only corridor. Give the pack a moment to
    // wander and try the next waypoint.
    console.log(
      `  · ${gotoReply.text} refused (${
        armed.type === "error" ? armed.code : "not enabled"
      }), trying the next waypoint`,
    );
    await sleep(1_500);
  }
  if (armedAt === null) {
    throw new Error("the bot would not arm from any of the route's first tiles");
  }

  step(`hunting the cave for ${WATCH_MS / 1_000} seconds`);
  const walkMark = client.mark();
  await sleep(WATCH_MS);
  const messages = client.messages.slice(walkMark);
  const steps = messages
    .filter(isType("creature-moved"))
    .filter((message) => message.creatureId === client.playerId);
  const status = messages.filter(isType("hunting-bot-status"));
  const advanced = status.filter((message) => message.enabled);
  const stops = status.filter((message) => !message.enabled);
  const targets = messages
    .filter(isType("attack-target-changed"))
    .filter((message) => message.creatureId !== null);
  const met = new Set(
    messages
      .filter(isType("creature-joined"))
      .map((message) => message.creature.name),
  );

  if (stops.length > 0) {
    throw new Error(
      `the server stopped the bot on this route: ${stops
        .map((message) => message.stopReason ?? "unknown")
        .join(", ")}`,
    );
  }
  if (steps.length === 0) throw new Error("the bot never moved the character");
  for (const move of steps) {
    if (chebyshev(move.from, move.position) > 1) {
      throw new Error(
        `the bot moved more than one tile in a step: ${JSON.stringify(move)}`,
      );
    }
  }
  ok(
    `walked ${steps.length} steps, advanced ${advanced.length} waypoints, ` +
      `engaged ${targets.length} targets`,
  );
  ok(`creatures met in the cave: ${[...met].join(", ") || "none"}`);
  if (targets.length === 0) {
    throw new Error("nothing in this cave was worth attacking");
  }

  step("stopping the bot");
  const stopMark = client.mark();
  client.send({ type: "set-hunting-bot-enabled", enabled: false });
  const stopped = await client.waitFor(
    isType("hunting-bot-status"),
    "hunting-bot-status after stopping",
    { since: stopMark },
  );
  if (stopped.enabled) throw new Error("the bot did not stop");
  ok("stopped");

  client.terminate();
} catch (cause) {
  failed = true;
  console.error("\n✗ scenario failed:", cause);
} finally {
  await server?.stop();
}

process.exit(failed ? 1 : 0);
