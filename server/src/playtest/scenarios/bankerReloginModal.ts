import { PlaytestClient } from "../PlaytestClient";
import { startPlaytestServer } from "../startPlaytestServer";

/**
 * Scenario: open the banker NPC dialogue, hard-disconnect with the modal
 * open, log back in, and verify the banker is still there and can be talked
 * to again. Run with: yarn playtest:banker-relogin
 */
const NAJI_HOME = { x: 32342, y: 32229, z: 7 };
const TOKEN = "dev-banker-scenario";
const CHARACTER = "Banker Tester";

const step = (text: string) => console.log(`\n▶ ${text}`);
const ok = (text: string) => console.log(`  ✓ ${text}`);

const externalUrl = process.env.PLAYTEST_SERVER_URL;
const server = externalUrl ? null : await startPlaytestServer({ log: false });
const url = externalUrl ?? server!.url;
let failed = false;

try {
  step(`connecting to ${url} as ${CHARACTER}`);
  const first = await PlaytestClient.connect(url);
  await first.enter(TOKEN, CHARACTER);
  ok(`entered world as ${first.playerId}`);

  step("teleporting next to the banker (Naji, Thais depot)");
  first.say(`/goto ${NAJI_HOME.x} ${NAJI_HOME.y + 1} ${NAJI_HOME.z}`);
  const gmReply = await first.waitFor(
    (m): m is Extract<typeof m, { type: "gm-response" }> =>
      m.type === "gm-response",
    "gm-response for /goto",
  );
  if (!gmReply.ok) throw new Error(`/goto failed: ${gmReply.text}`);
  ok(gmReply.text);

  step("waiting for Naji to spawn into view");
  const naji = await first.waitForCreatureNamed("Naji", { timeoutMs: 20_000 });
  ok(`Naji is visible at ${naji.position.x},${naji.position.y},${naji.position.z}`);

  step('greeting Naji ("hi") to open the dialogue modal');
  const beforeGreeting = first.mark();
  first.say("hi");
  const dialogue = await first.waitFor(
    (m): m is Extract<typeof m, { type: "npc-dialogue" }> =>
      m.type === "npc-dialogue" && m.npcName === "Naji",
    "npc-dialogue from Naji",
    { since: beforeGreeting },
  );
  ok(
    `modal open (conversation ${dialogue.conversationId}): ` +
      `"${dialogue.text.slice(0, 60)}..." with ${dialogue.options.length} options`,
  );

  step("hard-disconnecting with the modal still open");
  first.terminate();
  ok("socket terminated");

  step("logging back in with the same character");
  const second = await PlaytestClient.connect(url);
  await second.enter(TOKEN, CHARACTER);
  ok(`re-entered world as ${second.playerId}`);

  step("checking the banker is there after relogin");
  const najiAgain = await second.waitForCreatureNamed("Naji", {
    timeoutMs: 20_000,
  });
  ok(
    `Naji is present at ${najiAgain.position.x},${najiAgain.position.y},${najiAgain.position.z}`,
  );

  step("verifying a fresh conversation can be opened");
  const beforeSecondGreeting = second.mark();
  second.say("hi");
  const dialogueAgain = await second.waitFor(
    (m): m is Extract<typeof m, { type: "npc-dialogue" }> =>
      m.type === "npc-dialogue" && m.npcName === "Naji",
    "npc-dialogue from Naji after relogin",
    { since: beforeSecondGreeting },
  );
  if (dialogueAgain.conversationId === dialogue.conversationId) {
    throw new Error(
      "server reused the pre-disconnect conversation id after relogin",
    );
  }
  ok(`new conversation ${dialogueAgain.conversationId} opened`);

  second.terminate();
  console.log("\nPASS: banker survives a relogin with the modal open\n");
} catch (cause) {
  failed = true;
  console.error(
    `\nFAIL: ${cause instanceof Error ? cause.message : String(cause)}\n`,
  );
} finally {
  await server?.stop();
}
process.exit(failed ? 1 : 0);
