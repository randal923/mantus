import type { ServerMessage } from "@tibia/protocol";
import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: hunt the "the NPC is sometimes not spawned" report (Asima, the
 * Darashia potion seller). Every phase drives the real server over the real
 * map and asks one question: after this, does the client learn the NPC exists?
 *
 * When a phase fails, the scenario greets the NPC anyway ("hi" only needs the
 * server-side talk range, never the client's known-creature set), which splits
 * the two possible faults apart:
 *   - no greeting reply  -> the NPC is not in the world (spawn fault)
 *   - greeting replies   -> the NPC is in the world but the client was never
 *                           told about her (visibility fault)
 *
 * Run with: yarn playtest:npc-spawn
 */
const NPC_NAME = "Asima";
const HOME = { x: 33220, y: 32403, z: 7 };
/** Two tiles inside the shop: in view, and inside the dialogue talk range. */
const NEAR = { x: 33221, y: 32405, z: 7 };
/** Thais depot, far outside the 32-tile spawn activation range. */
const FAR = { x: 32342, y: 32230, z: 7 };
const TOKEN = "dev-npc-spawn-scenario";
/** A second account, so the watcher's login never kicks the first session. */
const SECOND_TOKEN = "dev-npc-spawn-watcher";
const CHARACTER = "Npc Spawn Tester";
const SECOND_CHARACTER = "Npc Spawn Observer";

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);
const bad = (text: string) => console.log(`  ✗ ${text}`);

const failures: string[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isGmResponse = (
  message: ServerMessage,
): message is Extract<ServerMessage, { type: "gm-response" }> =>
  message.type === "gm-response";

async function goto(
  client: PlaytestClient,
  position: { x: number; y: number; z: number },
): Promise<{ x: number; y: number; z: number }> {
  const since = client.mark();
  client.say(`/goto ${position.x} ${position.y} ${position.z}`);
  const reply = await client.waitFor(isGmResponse, "gm-response for /goto", {
    since,
  });
  if (!reply.ok) throw new Error(`/goto failed: ${reply.text}`);
  // Dev "/goto" answers "Position: x, y, z."; the admin one "Now at x,y,z."
  const match = /(\d+),\s*(\d+),\s*(\d+)/.exec(reply.text);
  if (!match) throw new Error(`unparsable /goto reply: ${reply.text}`);
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3]),
  };
}

/**
 * What the real client would be drawing: replay the whole message log the way
 * the renderer does (welcome + creature-joined add, creature-left removes) and
 * report the NPC's live entry. Asking "did a creature-joined arrive since a
 * mark?" would miss an NPC the client already knew about before the mark.
 */
function npcOnScreen(
  client: PlaytestClient,
): { id: string; position: { x: number; y: number; z: number } } | null {
  const live = new Map<
    string,
    { id: string; name: string; position: { x: number; y: number; z: number } }
  >();
  for (const message of client.messages) {
    if (message.type === "welcome") {
      for (const creature of message.creatures) {
        live.set(creature.id, {
          id: creature.id,
          name: creature.name,
          position: creature.position,
        });
      }
    } else if (message.type === "creature-joined") {
      live.set(message.creature.id, {
        id: message.creature.id,
        name: message.creature.name,
        position: message.creature.position,
      });
    } else if (message.type === "creature-left") {
      live.delete(message.creatureId);
    } else if (message.type === "creature-moved") {
      const known = live.get(message.creatureId);
      if (known) known.position = message.position;
    }
  }
  for (const creature of live.values()) {
    if (creature.name === NPC_NAME) return creature;
  }
  return null;
}

/** Waits until the client's own view holds the NPC. */
async function sawNpc(
  client: PlaytestClient,
  timeoutMs: number,
): Promise<{ id: string; position: { x: number; y: number; z: number } } | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = npcOnScreen(client);
    if (found) return found;
    if (Date.now() > deadline) return null;
    await sleep(50);
  }
}

/** Server-side probe: is she in the world at all, whatever the client knows? */
async function npcAnswersGreeting(client: PlaytestClient): Promise<boolean> {
  const since = client.mark();
  client.say("hi");
  try {
    await client.waitFor(
      (m): m is Extract<ServerMessage, { type: "npc-dialogue" }> =>
        m.type === "npc-dialogue" && m.npcName === NPC_NAME,
      `npc-dialogue from ${NPC_NAME}`,
      { since, timeoutMs: 4_000 },
    );
    client.say("bye");
    return true;
  } catch {
    return false;
  }
}

async function classifyFailure(
  client: PlaytestClient,
  label: string,
  since = 0,
): Promise<void> {
  const inWorld = await npcAnswersGreeting(client);
  const verdict = inWorld
    ? "VISIBILITY FAULT: she is in the world (greeted back) but the client " +
      "was never sent creature-joined"
    : "SPAWN FAULT: she is not in the world (no greeting reply)";
  bad(`${label} -> ${verdict}`);
  const joined = client.messages
    .slice(since)
    .filter((message) => message.type === "creature-joined")
    .map((message) =>
      message.type === "creature-joined" ? message.creature.name : "",
    );
  const known = client.messages
    .filter(
      (message): message is Extract<ServerMessage, { type: "welcome" }> =>
        message.type === "welcome",
    )
    .flatMap((message) => message.creatures.map((creature) => creature.name));
  console.log(`    creature-joined since the mark: ${joined.join(", ") || "none"}`);
  console.log(`    creatures in the welcome snapshots: ${known.join(", ") || "none"}`);
  failures.push(`${label}: ${inWorld ? "visibility" : "spawn"}`);
}

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
const cycles = Number(process.env.NPC_SPAWN_CYCLES ?? 10);
let crashed = false;

try {
  step(`connecting to ${url} as ${CHARACTER}`);
  const client = await PlaytestClient.connect(url);
  await client.enter(TOKEN, CHARACTER);
  ok(`entered world as ${client.playerId}`);

  // ---------------------------------------------------------------- phase 1
  step(`phase 1: first approach — teleport next to ${NPC_NAME}`);
  {
    const since = client.mark();
    const landed = await goto(client, NEAR);
    const npc = await sawNpc(client, 20_000);
    if (npc) {
      ok(
        `${NPC_NAME} joined at ${npc.position.x},${npc.position.y},${npc.position.z} ` +
          `(player at ${landed.x},${landed.y},${landed.z})`,
      );
    } else {
      await classifyFailure(client, "phase 1 first approach", since);
    }
  }

  // ---------------------------------------------------------------- phase 2
  step(`phase 2: dormancy churn ×${cycles} (leave, dwell 1.5s, return)`);
  {
    let missed = 0;
    for (let cycle = 1; cycle <= cycles; cycle++) {
      await goto(client, FAR);
      await sleep(1_500);
      await goto(client, NEAR);
      const npc = await sawNpc(client, 8_000);
      if (!npc) {
        missed++;
        await classifyFailure(client, `phase 2 cycle ${cycle}`);
      }
    }
    if (missed === 0) ok(`${cycles}/${cycles} returns saw ${NPC_NAME}`);
    else bad(`${missed}/${cycles} returns did not see ${NPC_NAME}`);
  }

  // ---------------------------------------------------------------- phase 3
  step(`phase 3: instant churn ×${cycles} (leave and return with no dwell)`);
  {
    let missed = 0;
    for (let cycle = 1; cycle <= cycles; cycle++) {
      await goto(client, FAR);
      await goto(client, NEAR);
      const npc = await sawNpc(client, 8_000);
      if (!npc) {
        missed++;
        await classifyFailure(client, `phase 3 cycle ${cycle}`);
      }
    }
    if (missed === 0) ok(`${cycles}/${cycles} instant returns saw ${NPC_NAME}`);
    else bad(`${missed}/${cycles} instant returns did not see ${NPC_NAME}`);
  }

  // ---------------------------------------------------------------- phase 4
  step("phase 4: stand on her home tile while she is dormant, then step off");
  {
    await goto(client, FAR);
    await sleep(1_500);
    const landed = await goto(client, HOME);
    const onHome =
      landed.x === HOME.x && landed.y === HOME.y && landed.z === HOME.z;
    ok(
      `player landed at ${landed.x},${landed.y},${landed.z}` +
        (onHome ? " (exactly on her home tile)" : " (snapped off her tile)"),
    );
    if (onHome) {
      const whileBlocked = await sawNpc(client, 4_000);
      ok(
        whileBlocked
          ? `she spawned anyway at ${whileBlocked.position.x},${whileBlocked.position.y}`
          : "she stayed unspawned while the tile was taken (expected)",
      );
      await goto(client, NEAR);
      const npc = await sawNpc(client, 8_000);
      if (npc) ok("she spawned once the tile was free again");
      else await classifyFailure(client, "phase 4 blocked home tile");
    }
  }

  // ---------------------------------------------------------------- phase 5
  step("phase 5: relogin standing next to her ×3");
  {
    let session = client;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await goto(session, NEAR);
      session.terminate();
      await sleep(500);
      const next = await PlaytestClient.connect(url);
      await next.enter(TOKEN, CHARACTER);
      const npc = await sawNpc(next, 10_000);
      if (npc) ok(`relogin ${attempt}: ${NPC_NAME} present`);
      else await classifyFailure(next, `phase 5 relogin ${attempt}`);
      session = next;
    }

    // ---------------------------------------------------------------- phase 6
    step("phase 6: floor churn — go one floor up and come back down");
    {
      const above = { x: HOME.x, y: HOME.y, z: HOME.z - 1 };
      try {
        const landed = await goto(session, above);
        ok(`upstairs at ${landed.x},${landed.y},${landed.z}`);
        await sleep(1_500);
        await goto(session, NEAR);
        const npc = await sawNpc(session, 8_000);
        if (npc) ok("she is back after the floor round trip");
        else await classifyFailure(session, "phase 6 floor churn");
      } catch (error) {
        ok(`no walkable tile above the shop, skipping (${String(error)})`);
      }
    }

    // ---------------------------------------------------------------- phase 7
    step("phase 7: two clients leave and return one at a time");
    {
      const watcher = await PlaytestClient.connect(url);
      await watcher.enter(SECOND_TOKEN, SECOND_CHARACTER);
      await goto(watcher, NEAR);
      await goto(session, NEAR);
      await goto(watcher, FAR);
      await goto(session, FAR);
      await sleep(1_500);
      await goto(session, NEAR);
      const seenByA = await sawNpc(session, 8_000);
      if (seenByA) ok("first client saw her on return");
      else await classifyFailure(session, "phase 7 first client");
      await goto(watcher, NEAR);
      const seenByB = await sawNpc(watcher, 8_000);
      if (seenByB) ok("second client saw her on return");
      else await classifyFailure(watcher, "phase 7 second client");
      watcher.terminate();
    }

    // ---------------------------------------------------------------- phase 8
    step("phase 8: stand next to her for 60s and watch for a vanish");
    {
      await goto(session, NEAR);
      const npc = await sawNpc(session, 8_000);
      if (!npc) throw new Error("she was gone before the idle watch started");
      await sleep(60_000);
      if (npcOnScreen(session)) ok("she stayed put for the whole minute");
      else await classifyFailure(session, "phase 8 vanished while standing by");
    }

    session.terminate();
  }
} catch (error) {
  crashed = true;
  console.error("\nscenario crashed:", error);
} finally {
  step("summary");
  if (failures.length === 0 && !crashed) {
    ok("every phase saw the NPC — no reproduction on the server path");
  } else {
    for (const failure of failures) bad(failure);
  }
  await server?.stop();
  process.exit(failures.length > 0 || crashed ? 1 : 0);
}
