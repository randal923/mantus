import { serverConfig } from "./config";
import { GameServer } from "./GameServer";

const server = new GameServer(serverConfig);
server.start();

const shutdown = () => {
  server.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
