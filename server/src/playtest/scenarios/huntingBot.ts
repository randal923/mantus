import type { Position, ServerMessage } from "@tibia/protocol";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: drive the hunting bot over the real wire protocol — trace a
 * guide's straight-line route into a walkable chain, save it, arm the bot,
 * and watch the character actually walk it. Also checks the two refusals a
 * player can hit: arming an empty route and arming from outside the hunt.
 * Run with: yarn playtest:hunting-bot
 */
const TOKEN = "dev-hunting-bot-scenario";
// The playtest database persists between runs, so the character is new each
// time and starts with an empty saved route.
const CHARACTER = `Router ${Array.from(
  { length: 8 },
  () => String.fromCharCode(97 + Math.floor(Math.random() * 26)),
).join("")}`;
/**
 * Open ground south-east of Thais, outside any protection zone and right on
 * top of a snake spawn cluster — the bot has to have something to target.
 */
const ANCHOR: Position = { x: 32_362, y: 32_281, z: 7 };

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const chebyshev = (from: Position, to: Position) =>
  Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let failed = false;

const isType = <T extends ServerMessage["type"]>(type: T) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: T }> =>
    m.type === type;

try {
  step(`connecting to ${url} as ${CHARACTER}`);
  const client = await PlaytestClient.connect(url);
  await client.enter(TOKEN, CHARACTER);
  ok(`entered world as ${client.playerId}`);

  step("boosting to level 200 so a snake dies in one hit");
  client.say("/level 200");
  await client.waitFor(isType("gm-response"), "gm-response for /level");

  step("leaving the temple protection zone");
  const gotoMark = client.mark();
  client.say(`/goto ${ANCHOR.x} ${ANCHOR.y} ${ANCHOR.z}`);
  const gotoReply = await client.waitFor(
    isType("gm-response"),
    "gm-response for /goto",
    { since: gotoMark },
  );
  if (!gotoReply.ok) throw new Error(`/goto failed: ${gotoReply.text}`);
  ok(gotoReply.text);

  step("a fresh character starts with no saved route");
  const emptyMark = client.mark();
  client.send({ type: "set-hunting-bot-enabled", enabled: true });
  const emptyError = await client.waitFor(
    isType("error"),
    "error for arming an empty route",
    { since: emptyMark },
  );
  if (emptyError.code !== "hunting-bot-invalid") {
    throw new Error(`expected hunting-bot-invalid, got ${emptyError.code}`);
  }
  ok("arming an empty route is refused");

  step("tracing a guide-style straight-line loop into a walkable chain");
  // Exactly the shape a hunting guide stores: corners of a box, joined by
  // dead-reckoned lines that ignore every wall between them.
  const guidePoints: Position[] = [
    ANCHOR,
    { x: ANCHOR.x + 12, y: ANCHOR.y, z: ANCHOR.z },
    { x: ANCHOR.x + 12, y: ANCHOR.y + 12, z: ANCHOR.z },
    { x: ANCHOR.x, y: ANCHOR.y + 12, z: ANCHOR.z },
    ANCHOR,
  ];
  const traceMark = client.mark();
  client.send({ type: "hunting-bot-trace", points: guidePoints });
  const traced = await client.waitFor(
    isType("hunting-bot-traced"),
    "hunting-bot-traced",
    { since: traceMark },
  );
  if (traced.waypoints.length < guidePoints.length) {
    throw new Error(
      `trace returned ${traced.waypoints.length} waypoints, expected a denser chain`,
    );
  }
  let widestGap = 0;
  for (let index = 1; index < traced.waypoints.length; index++) {
    widestGap = Math.max(
      widestGap,
      chebyshev(traced.waypoints[index - 1]!, traced.waypoints[index]!),
    );
  }
  ok(
    `traced ${traced.waypoints.length} waypoints, widest gap ${widestGap} tiles, ` +
      `${traced.unresolvedWaypointIndexes.length} unreachable`,
  );

  step("saving the traced route");
  const saveMark = client.mark();
  client.send({
    type: "update-hunting-bot-route",
    route: { huntName: "Playtest Loop", waypoints: traced.waypoints },
  });
  const saved = await client.waitFor(
    isType("hunting-bot-route"),
    "hunting-bot-route echo",
    { since: saveMark },
  );
  if (saved.route.waypoints.length !== traced.waypoints.length) {
    throw new Error("the server stored a different route than it was sent");
  }
  ok(`server stored ${saved.route.waypoints.length} waypoints`);

  step("arming the bot");
  const armMark = client.mark();
  client.send({ type: "set-hunting-bot-enabled", enabled: true });
  const armed = await client.waitFor(
    isType("hunting-bot-status"),
    "hunting-bot-status",
    { since: armMark },
  );
  if (!armed.enabled) throw new Error("the bot refused to arm");
  ok(`armed at waypoint ${armed.waypointIndex + 1}`);

  step("watching the character hunt the route for 20 seconds");
  const walkMark = client.mark();
  await sleep(20_000);
  const steps = client.messages
    .slice(walkMark)
    .filter(isType("creature-moved"))
    .filter((message) => message.creatureId === client.playerId);
  const advanced = client.messages
    .slice(walkMark)
    .filter(isType("hunting-bot-status"));
  const targets = client.messages
    .slice(walkMark)
    .filter(isType("attack-target-changed"))
    .filter((message) => message.creatureId !== null);
  if (steps.length === 0) {
    throw new Error("the bot never moved the character");
  }
  const travelled = chebyshev(steps[0]!.from, steps.at(-1)!.position);
  ok(
    `walked ${steps.length} steps, ${travelled} tiles from where it started, ` +
      `advanced ${advanced.length} waypoints, engaged ${targets.length} targets`,
  );
  // Walking and fighting are exclusive by design: the bot stands its ground
  // while something is alive in front of it. A run that only fought is fine,
  // a run that did neither is not.
  if (advanced.length === 0 && targets.length === 0) {
    throw new Error("the bot neither advanced a waypoint nor picked a target");
  }
  // Every step the bot walked must land on a tile adjacent to the last one:
  // the server re-validates each step, so a route can never teleport.
  for (const move of steps) {
    if (chebyshev(move.from, move.position) > 1) {
      throw new Error(
        `the bot moved more than one tile in a step: ${JSON.stringify(move)}`,
      );
    }
  }
  ok("every step was a single adjacent tile");

  step("the route walked the character into something and it fought back");
  const targeted =
    targets.at(0) ??
    (await client
      .waitFor(
        (message): message is Extract<ServerMessage, { type: "attack-target-changed" }> =>
          message.type === "attack-target-changed" &&
          message.creatureId !== null,
        "attack-target-changed from the auto-target",
        { timeoutMs: 30_000 },
      )
      .catch(() => null));
  if (!targeted?.creatureId) {
    throw new Error("the bot never picked a target while hunting");
  }
  const targetName = client.messages
    .filter(isType("creature-joined"))
    .find((message) => message.creature.id === targeted.creatureId)?.creature
    .name;
  ok(`auto-targeted ${targetName ?? targeted.creatureId}`);

  step("stopping the bot");
  const stopMark = client.mark();
  client.send({ type: "set-hunting-bot-enabled", enabled: false });
  const stopped = await client.waitFor(
    isType("hunting-bot-status"),
    "hunting-bot-status after stopping",
    { since: stopMark },
  );
  if (stopped.enabled) throw new Error("the bot did not stop");
  const afterStop = client.mark();
  client.send({ type: "cancel-attack" });
  await sleep(1_500);
  const strayed = client.messages
    .slice(afterStop)
    .filter(isType("creature-moved"))
    .filter((message) => message.creatureId === client.playerId);
  if (strayed.length > 0) {
    throw new Error("the character kept walking after the bot was stopped");
  }
  ok("stopped and stayed put");

  step("arming from outside the hunting ground is refused");
  const awayMark = client.mark();
  client.say(`/goto ${ANCHOR.x} ${ANCHOR.y - 2} ${ANCHOR.z}`);
  await client.waitFor(isType("gm-response"), "gm-response for /goto", {
    since: awayMark,
  });
  const farRoute = traced.waypoints.map((waypoint) => ({
    x: waypoint.x + 400,
    y: waypoint.y + 400,
    z: waypoint.z,
  }));
  const farMark = client.mark();
  client.send({
    type: "update-hunting-bot-route",
    route: { huntName: "Far Away", waypoints: farRoute },
  });
  await client.waitFor(isType("hunting-bot-route"), "hunting-bot-route echo", {
    since: farMark,
  });
  const refusedMark = client.mark();
  client.send({ type: "set-hunting-bot-enabled", enabled: true });
  const refused = await client.waitFor(
    isType("error"),
    "error for arming from out of range",
    { since: refusedMark },
  );
  if (refused.code !== "hunting-bot-out-of-range") {
    throw new Error(`expected hunting-bot-out-of-range, got ${refused.code}`);
  }
  ok("a route on the other side of the map cannot be armed");

  client.terminate();
  console.log("\nhunting bot scenario passed");
} catch (error) {
  failed = true;
  console.error("\nhunting bot scenario failed:", error);
} finally {
  await server?.stop();
  process.exit(failed ? 1 : 0);
}
