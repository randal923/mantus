import { describe, expect, it } from "vitest";
import { buildStatusXml } from "./buildStatusXml";
import type { StatusConfig } from "./StatusConfig";
import type { StatusSnapshot } from "./StatusSnapshot";

const CONFIG: StatusConfig = {
  port: 7171,
  ip: "203.0.113.7",
  serverName: "Mantus <Online> & \"Friends\"",
  location: "United States",
  url: "https://mantusonline.com/",
  ownerName: "Mantus Online",
  ownerEmail: "",
  motd: "Welcome! <b>bold</b>",
  cacheMs: 5_000,
};

const SNAPSHOT: StatusSnapshot = {
  uptimeSeconds: 3_601,
  playersOnline: 12,
  uniqueAddresses: 9,
  maxPlayers: 2_000,
  peakPlayers: 40,
  monsters: 84_000,
  npcs: 377,
  rates: { experience: 2, skill: 2, loot: 4, magic: 2, spawn: 2 },
  mapName: "canary",
};

describe("buildStatusXml", () => {
  it("renders Canary's tsqp document with escaped text", () => {
    const xml = buildStatusXml(CONFIG, SNAPSHOT);
    expect(xml).toBe(
      '<?xml version="1.0"?><tsqp version="1.0">' +
        '<serverinfo uptime="3601" ip="203.0.113.7" ' +
        'servername="Mantus &lt;Online&gt; &amp; &quot;Friends&quot;" ' +
        'port="7171" location="United States" url="https://mantusonline.com/" ' +
        'server="Mantus" version="1.0" client="web"/>' +
        '<owner name="Mantus Online" email=""/>' +
        '<players online="12" unique="9" max="2000" peak="40"/>' +
        '<monsters total="84000"/><npcs total="377"/>' +
        '<rates experience="2" skill="2" loot="4" magic="2" spawn="2"/>' +
        '<map name="canary" author="CipSoft"/>' +
        "<motd>Welcome! &lt;b&gt;bold&lt;/b&gt;</motd></tsqp>",
    );
  });
});
