import { startPlaytestServer } from "./startPlaytestServer";

/**
 * Keeps a playtest game server alive for external e2e runs (the client's
 * browser tests spawn this as a child). Prints E2E_SERVER_READY once
 * listening and shuts the server down on SIGTERM/SIGINT.
 */
const server = await startPlaytestServer({
  log: process.env.PLAYTEST_LOG === "1",
});
console.log(`E2E_SERVER_READY ${server.url}`);

const stop = () => {
  void server.stop().then(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
