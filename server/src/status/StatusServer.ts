import { createServer, type Server, type Socket } from "node:net";
import { buildStatusInfo } from "./buildStatusInfo";
import { buildStatusXml } from "./buildStatusXml";
import {
  MAX_STATUS_REQUEST_BYTES,
  parseStatusRequest,
} from "./parseStatusRequest";
import type { StatusConfig } from "./StatusConfig";
import type { StatusSnapshot } from "./StatusSnapshot";

/** Sockets that have not sent a full query by then are dropped (rule 10). */
const SOCKET_TIMEOUT_MS = 3_000;
/** Concurrent status sockets; list crawlers open one at a time. */
const MAX_CONNECTIONS = 32;

/**
 * Raw-TCP OpenTibia status protocol listener (Canary's ProtocolStatus), the
 * endpoint otservlist.org and friends poll for uptime and player counts.
 * Read-only: it never touches game state, only the snapshot the game server
 * renders for it, and the rendered reply is cached for `cacheMs` so a query
 * flood costs one XML build per window.
 */
export class StatusServer {
  private readonly server: Server;
  private cached: { readonly snapshot: StatusSnapshot; readonly at: number } | undefined;

  constructor(
    private readonly config: StatusConfig,
    private readonly snapshot: () => StatusSnapshot,
    private readonly now: () => number = Date.now,
  ) {
    this.server = createServer((socket) => this.onConnection(socket));
    this.server.maxConnections = MAX_CONNECTIONS;
    this.server.on("error", (cause) => {
      console.error(`status listener error: ${cause.message}`);
    });
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.config.port, () => {
        this.server.off("error", reject);
        resolve();
      });
    });
  }

  get port(): number {
    const address = this.server.address();
    return typeof address === "object" && address
      ? address.port
      : this.config.port;
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((cause) => {
        if (cause && !/ERR_SERVER_NOT_RUNNING/.test(String(cause))) {
          reject(cause);
          return;
        }
        resolve();
      });
    });
  }

  private onConnection(socket: Socket): void {
    const chunks: Buffer[] = [];
    let received = 0;
    socket.setTimeout(SOCKET_TIMEOUT_MS, () => socket.destroy());
    socket.on("error", () => socket.destroy());
    socket.on("data", (chunk) => {
      received += chunk.length;
      if (received > MAX_STATUS_REQUEST_BYTES) {
        socket.destroy();
        return;
      }
      chunks.push(chunk);
      const parsed = parseStatusRequest(Buffer.concat(chunks));
      if (parsed.state === "incomplete") return;
      if (parsed.state === "invalid") {
        socket.destroy();
        return;
      }
      const snapshot = this.currentSnapshot();
      const reply =
        parsed.request.kind === "xml"
          ? Buffer.from(buildStatusXml(this.config, snapshot), "utf8")
          : buildStatusInfo(this.config, snapshot, parsed.request.flags);
      socket.end(reply);
    });
  }

  private currentSnapshot(): StatusSnapshot {
    const now = this.now();
    if (this.cached && now - this.cached.at < this.config.cacheMs) {
      return this.cached.snapshot;
    }
    const snapshot = this.snapshot();
    this.cached = { snapshot, at: now };
    return snapshot;
  }
}
