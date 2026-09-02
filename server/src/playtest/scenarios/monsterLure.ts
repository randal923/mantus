import type { Position, ServerMessage } from "@tibia/protocol";
import { ParityRig } from "../ParityRig";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: a lured monster walks back to its spawn instead of freezing.
 * - spawn a wasp on the open field south-west of Thais and lure it 40+
 *   tiles east, one step at a time so it never loses the chase
 * - teleport out of its acquisition range (still inside the spawn activation
 *   box) so it drops the target with the whole lure between it and home —
 *   far beyond what one path-search budget can cover
 * - come back to the spawn and expect the wasp there
 * Run with: yarn playtest:monster-lure
 */

// Fresh dev account per run: accounts cap at 5 characters.
const TOKEN = `dev-monster-lure-${Math.random().toString(36).slice(2, 8)}`;
/**
 * Open field south-west of Thais: rows 32400..32404 are walkable non-PZ
 * ground for x 32313..32362. Open ground matters — on a walled street the
 * unfixed breadth-first search still reached home from 28 tiles, while here
 * (checked offline against the real map) it exhausts its 640 nodes from 34
 * tiles out.
 */
const HOME_SPOT: Position = { x: 32_316, y: 32_402, z: 7 };
const LURE_END_X = 32_359;
/**
 * Off the row by 11 tiles: beyond the 8-tile acquisition range, inside the
 * 32-tile spawn activation box for the whole walk home.
 */
const PARK: Position = { x: 32_338, y: 32_391, z: 7 };
const MONSTER = { typeId: "wasp", name: "Wasp" };
const RETURN_WAIT_MS = 110_000;

interface CheckResult {
  name: string;
  status: "pass" | "fail";
  detail: string;
}

const results: CheckResult[] = [];
const check = (name: string, ok: boolean, detail: string) => {
  results.push({ name, status: ok ? "pass" : "fail", detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}: ${detail}`);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const randomName = (prefix: string) =>
  `${prefix} ${Array.from({ length: 8 }, () =>
    String.fromCharCode(97 + Math.floor(Math.random() * 26)),
  ).join("")}`;

const chebyshev = (a: Position, b: Position) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const isType = <T extends ServerMessage["type"]>(type: T) =>
  (m: ServerMessage): m is Extract<ServerMessage, { type: T }> =>
    m.type === type;

/**
 * Whether the client currently has the creature in view — the last of its
 * joined/left messages wins (a view re-announce sends both back to back).
 */
function inView(rig: ParityRig, creatureId: string): boolean {
  for (let i = rig.client.messages.length - 1; i >= 0; i--) {
    const message = rig.client.messages[i];
    if (message?.type === "creature-left" && message.creatureId === creatureId) {
      return false;
    }
    if (
      message?.type === "creature-joined" &&
      message.creature.id === creatureId
    ) {
      return true;
    }
  }
  return true;
}

/**
 * Steps east one tile at a time and lets the monster close to within 3 tiles
 * after each step, so the chase never drops. Gives up after twice the tiles
 * needed so a blocked step cannot spin forever.
 */
async function lureEast(
  rig: ParityRig,
  monsterId: string,
  untilX: number,
): Promise<{ steps: number; farthest: number }> {
  let steps = 0;
  let farthest = 0;
  const maxSteps = (untilX - rig.position.x) * 2;
  while (rig.position.x < untilX && steps < maxSteps) {
    await rig.step("east");
    steps++;
    // Pace the walk: back-to-back steps only earn corrections from the walk
    // cooldown, and a flood of intents gets the connection dropped.
    await sleep(250);
    const deadline = Date.now() + 6_000;
    for (;;) {
      const monster = rig.creaturePosition(monsterId);
      const gap =
        monster && inView(rig, monsterId)
          ? chebyshev(monster, rig.position)
          : Infinity;
      if (Number.isFinite(gap)) farthest = Math.max(farthest, gap);
      if (gap <= 3 || Date.now() > deadline) break;
      await sleep(100);
    }
  }
  return { steps, farthest };
}

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let crashed = false;

try {
  const rig = await ParityRig.create(url, TOKEN, randomName("Lurer"), "Knight");
  await rig.setupStats({ level: 300 });
  await rig.goto(HOME_SPOT.x, HOME_SPOT.y, HOME_SPOT.z);
  rig.client.send({
    type: "set-fight-mode",
    mode: { attack: "defensive", chase: false, secure: true },
  });

  console.log(`▶ spawn ${MONSTER.name} at the corridor's west end`);
  const monster = await rig.spawnMonster(MONSTER.typeId, MONSTER.name);
  const home = monster.position;
  console.log(`  ${MONSTER.name} ${monster.id} spawned at ${home.x},${home.y}`);

  console.log(`▶ lure it east to x=${LURE_END_X}`);
  const lure = await lureEast(rig, monster.id, LURE_END_X);
  const luredTo = rig.creaturePosition(monster.id);
  const luredDistance = luredTo ? chebyshev(luredTo, home) : 0;
  check(
    "lure-followed",
    luredTo !== null && luredDistance >= 34,
    `${lure.steps} steps to ${rig.position.x},${rig.position.y}; ${MONSTER.name} at ${luredTo?.x},${luredTo?.y}, ${luredDistance} tiles from its spawn (largest gap during the chase ${lure.farthest})`,
  );

  console.log("▶ break the chase and wait for it to walk home");
  await rig.goto(PARK.x, PARK.y, PARK.z);
  await rig.gm("/heal").catch(() => undefined);
  const parkMark = rig.mark();
  await sleep(RETURN_WAIT_MS);
  const attacksWhileParked = rig
    .messagesSince(parkMark)
    .filter(isType("combat-text"))
    .filter((m) => m.position.x === PARK.x && m.position.y === PARK.y).length;
  check(
    "chase-dropped",
    attacksWhileParked === 0,
    `${attacksWhileParked} hits taken while parked out of range`,
  );

  console.log("▶ back to the spawn");
  await rig.goto(HOME_SPOT.x, HOME_SPOT.y, HOME_SPOT.z);
  let nearest: Position | null = null;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const at = rig.creaturePosition(monster.id);
    if (at && inView(rig, monster.id)) nearest = at;
    if (nearest && chebyshev(nearest, home) <= 4) break;
    await sleep(500);
  }
  const homeDistance = nearest ? chebyshev(nearest, home) : null;
  check(
    "returned-home",
    homeDistance !== null && homeDistance <= 4,
    nearest
      ? `${MONSTER.name} at ${nearest.x},${nearest.y}, ${homeDistance} tiles from its spawn ${home.x},${home.y}`
      : `${MONSTER.name} never came back into view around its spawn ${home.x},${home.y}`,
  );

  rig.client.terminate();
} catch (error) {
  crashed = true;
  console.error("scenario crashed:", error);
} finally {
  await server?.stop();
}

const failed = results.filter((r) => r.status === "fail");
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed${
    failed.length ? `: ${failed.map((r) => r.name).join(", ")} failed` : ""
  }`,
);
process.exit(crashed || failed.length > 0 ? 1 : 0);
