import { connect } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { STATUS_REQUEST } from "./parseStatusRequest";
import { StatusServer } from "./StatusServer";
import type { StatusConfig } from "./StatusConfig";
import type { StatusSnapshot } from "./StatusSnapshot";

const CONFIG: StatusConfig = {
  port: 0,
  ip: "203.0.113.7",
  serverName: "Mantus Online",
  location: "United States",
  url: "https://mantusonline.com/",
  ownerName: "Mantus Online",
  ownerEmail: "owner@example.com",
  motd: "Welcome",
  cacheMs: 5_000,
};

const XML_QUERY = Buffer.from([0x06, 0x00, 0xff, 0xff, 0x69, 0x6e, 0x66, 0x6f]);

function snapshotWith(playersOnline: number): StatusSnapshot {
  return {
    uptimeSeconds: 10,
    playersOnline,
    uniqueAddresses: playersOnline,
    maxPlayers: 100,
    peakPlayers: 50,
    monsters: 3,
    npcs: 2,
    rates: { experience: 2, skill: 2, loot: 4, magic: 2, spawn: 2 },
    mapName: "test",
  };
}

interface Exchange {
  readonly reply: Buffer;
  readonly closedByServer: boolean;
}

function exchange(
  port: number,
  chunks: ReadonlyArray<Buffer>,
  holdOpenMs = 0,
): Promise<Exchange> {
  return new Promise((resolve, reject) => {
    const socket = connect({ port, host: "127.0.0.1" });
    const received: Buffer[] = [];
    let closedByServer = false;
    socket.on("data", (chunk) => received.push(chunk));
    socket.on("end", () => {
      closedByServer = true;
    });
    socket.on("error", (cause: NodeJS.ErrnoException) => {
      if (cause.code === "ECONNRESET") {
        closedByServer = true;
        return;
      }
      reject(cause);
    });
    socket.on("close", () =>
      resolve({ reply: Buffer.concat(received), closedByServer }),
    );
    socket.on("connect", () => {
      for (const chunk of chunks) socket.write(chunk);
      if (holdOpenMs > 0) setTimeout(() => socket.end(), holdOpenMs);
    });
  });
}

describe("StatusServer", () => {
  let server: StatusServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("answers the otservlist XML query raw and hangs up", async () => {
    let calls = 0;
    server = new StatusServer(CONFIG, () => {
      calls++;
      return snapshotWith(7);
    });
    await server.listen();
    const { reply, closedByServer } = await exchange(server.port, [XML_QUERY]);
    const xml = reply.toString("utf8");
    expect(xml.startsWith('<?xml version="1.0"?><tsqp version="1.0">')).toBe(
      true,
    );
    expect(xml).toContain('<players online="7" unique="7" max="100" peak="50"/>');
    expect(xml).toContain('ip="203.0.113.7" servername="Mantus Online" port="0"');
    expect(closedByServer).toBe(true);
    expect(calls).toBe(1);
  });

  it("reassembles a query that arrives one byte at a time", async () => {
    server = new StatusServer(CONFIG, () => snapshotWith(1));
    await server.listen();
    const bytes = [...XML_QUERY].map((byte) => Buffer.from([byte]));
    const { reply } = await exchange(server.port, bytes);
    expect(reply.toString("utf8")).toContain('<players online="1"');
  });

  it("reuses one snapshot per cache window", async () => {
    let now = 1_000;
    let calls = 0;
    server = new StatusServer(
      { ...CONFIG, cacheMs: 5_000 },
      () => {
        calls++;
        return snapshotWith(calls);
      },
      () => now,
    );
    await server.listen();
    await exchange(server.port, [XML_QUERY]);
    const second = await exchange(server.port, [XML_QUERY]);
    expect(second.reply.toString("utf8")).toContain('online="1"');
    now += 5_000;
    const third = await exchange(server.port, [XML_QUERY]);
    expect(third.reply.toString("utf8")).toContain('online="2"');
    expect(calls).toBe(2);
  });

  it("answers the binary query with a length-framed payload", async () => {
    server = new StatusServer(CONFIG, () => snapshotWith(7));
    await server.listen();
    const flags = STATUS_REQUEST.basicServerInfo | STATUS_REQUEST.playersInfo;
    const query = Buffer.from([0x04, 0x00, 0xff, 0x01, flags, 0x00]);
    const { reply } = await exchange(server.port, [query]);
    expect(reply.readUInt16LE(0)).toBe(reply.length - 2);
    let offset = 2;
    expect(reply[offset++]).toBe(0x10);
    const readString = () => {
      const length = reply.readUInt16LE(offset);
      offset += 2;
      const value = reply.toString("latin1", offset, offset + length);
      offset += length;
      return value;
    };
    expect(readString()).toBe("Mantus Online");
    expect(readString()).toBe("203.0.113.7");
    expect(readString()).toBe("0");
    expect(reply[offset++]).toBe(0x20);
    expect(reply.readUInt32LE(offset)).toBe(7);
    expect(reply.readUInt32LE(offset + 4)).toBe(100);
    expect(reply.readUInt32LE(offset + 8)).toBe(50);
    expect(offset + 12).toBe(reply.length);
  });

  it("does not list players even when the binary query asks for them", async () => {
    server = new StatusServer(CONFIG, () => snapshotWith(7));
    await server.listen();
    const flags =
      STATUS_REQUEST.extPlayersInfo | STATUS_REQUEST.serverSoftwareInfo;
    const query = Buffer.from([0x04, 0x00, 0xff, 0x01, flags, 0x00]);
    const { reply } = await exchange(server.port, [query]);
    expect(reply[2]).toBe(0x23);
    expect(reply.includes(0x21)).toBe(false);
  });

  it("drops malformed, oversized and silent connections without replying", async () => {
    let calls = 0;
    server = new StatusServer(CONFIG, () => {
      calls++;
      return snapshotWith(1);
    });
    await server.listen();
    const http = await exchange(server.port, [
      Buffer.from("GET / HTTP/1.1\r\nHost: x\r\n\r\n"),
    ]);
    expect(http.reply.length).toBe(0);
    expect(http.closedByServer).toBe(true);
    const oversized = await exchange(server.port, [Buffer.alloc(600, 0xff)]);
    expect(oversized.reply.length).toBe(0);
    expect(oversized.closedByServer).toBe(true);
    const wrongLength = await exchange(server.port, [
      Buffer.from([0x00, 0x04, 0xff, 0xff, 0x69, 0x6e]),
    ]);
    expect(wrongLength.reply.length).toBe(0);
    expect(wrongLength.closedByServer).toBe(true);
    expect(calls).toBe(0);
  });
});
