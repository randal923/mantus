import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: stand next to a placed imbuing shrine, use it the way a
 * right-click does, and verify the window opens. Also checks the adjacency
 * rule from the other side — the same use from out of reach must not open it.
 * Run with: yarn playtest:imbuement-shrine
 */
// An "imbuing shrine" (25060) the converter now emits as a server-owned map
// item; before that it was baked draw-only and the server held nothing here.
const SHRINE = { x: 33_774, y: 32_754, z: 3 };
const TOKEN = "dev-imbuement-scenario";
const CHARACTER = "Imbue Tester";

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let failed = false;

try {
  step(`connecting to ${url} as ${CHARACTER}`);
  const client = await PlaytestClient.connect(url);
  await client.enter(TOKEN, CHARACTER);
  ok(`entered world as ${client.playerId}`);

  step(`teleporting next to the shrine at ${SHRINE.x},${SHRINE.y},${SHRINE.z}`);
  client.say(`/goto ${SHRINE.x} ${SHRINE.y + 1} ${SHRINE.z}`);
  const gmReply = await client.waitFor(
    (m): m is Extract<typeof m, { type: "gm-response" }> =>
      m.type === "gm-response",
    "gm-response for /goto",
  );
  if (!gmReply.ok) throw new Error(`/goto failed: ${gmReply.text}`);
  ok(gmReply.text);

  step("using the shrine (what a right-click sends)");
  const beforeUse = client.mark();
  client.send({ type: "use-map", position: SHRINE });
  const window = await client.waitFor(
    (m): m is Extract<typeof m, { type: "imbuement-window-state" }> =>
      m.type === "imbuement-window-state",
    "imbuement-window-state",
    { since: beforeUse },
  );
  ok(
    `window opened: mode=${window.mode} itemId=${String(window.itemId)} ` +
      `options=${window.options.length} slots=${window.slotCount} ` +
      `blankScrolls=${window.blankScrollCount} bank=${window.bankBalance}`,
  );
  if (window.itemId !== null) {
    throw new Error("shrine use should open with no item picked");
  }
  if (window.options.length === 0) {
    throw new Error("shrine window carried no imbuement options");
  }
  const tiers = new Set(window.options.map((option) => option.baseId));
  ok(`tiers present: ${[...tiers].sort().join(", ")} (blocked ones included)`);

  step("walking out of reach and using it again");
  client.say(`/goto ${SHRINE.x + 12} ${SHRINE.y + 12} ${SHRINE.z}`);
  await client.waitFor(
    (m): m is Extract<typeof m, { type: "gm-response" }> =>
      m.type === "gm-response",
    "gm-response for second /goto",
  );
  const beforeFar = client.mark();
  client.send({ type: "use-map", position: SHRINE });
  const far = await Promise.race([
    client
      .waitFor(
        (m): m is Extract<typeof m, { type: "imbuement-window-state" }> =>
          m.type === "imbuement-window-state",
        "unexpected window from out of range",
        { since: beforeFar, timeoutMs: 2_000 },
      )
      .then(() => "opened" as const)
      .catch(() => "no-window" as const),
    new Promise<"no-window">((resolve) =>
      setTimeout(() => resolve("no-window"), 2_500),
    ),
  ]);
  if (far === "opened") {
    throw new Error("the window opened from out of range");
  }
  ok("no window from out of range, as the adjacency rule requires");

  client.terminate();
} catch (cause) {
  failed = true;
  console.error("\n✗ scenario failed:", cause);
} finally {
  await server?.stop();
}

process.exit(failed ? 1 : 0);
