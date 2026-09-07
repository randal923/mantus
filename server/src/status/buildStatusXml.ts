import { escapeXml } from "./escapeXml";
import type { StatusConfig } from "./StatusConfig";
import type { StatusSnapshot } from "./StatusSnapshot";

export const STATUS_SERVER_SOFTWARE = "Mantus";
export const STATUS_SERVER_VERSION = "1.0";
export const STATUS_CLIENT_VERSION = "web";

/**
 * The `tsqp` document Canary's ProtocolStatus::sendStatusString emits, which
 * is what otservlist.org and the other OT server lists parse. Sent raw: no
 * length header, unlike every other OT packet.
 */
export function buildStatusXml(
  config: StatusConfig,
  snapshot: StatusSnapshot,
): string {
  const attributes = (pairs: ReadonlyArray<readonly [string, string | number]>) =>
    pairs
      .map(([name, value]) => `${name}="${escapeXml(String(value))}"`)
      .join(" ");
  const serverinfo = attributes([
    ["uptime", snapshot.uptimeSeconds],
    ["ip", config.ip],
    ["servername", config.serverName],
    ["port", config.port],
    ["location", config.location],
    ["url", config.url],
    ["server", STATUS_SERVER_SOFTWARE],
    ["version", STATUS_SERVER_VERSION],
    ["client", STATUS_CLIENT_VERSION],
  ]);
  const owner = attributes([
    ["name", config.ownerName],
    ["email", config.ownerEmail],
  ]);
  const players = attributes([
    ["online", snapshot.playersOnline],
    ["unique", snapshot.uniqueAddresses],
    ["max", snapshot.maxPlayers],
    ["peak", snapshot.peakPlayers],
  ]);
  const rates = attributes([
    ["experience", snapshot.rates.experience],
    ["skill", snapshot.rates.skill],
    ["loot", snapshot.rates.loot],
    ["magic", snapshot.rates.magic],
    ["spawn", snapshot.rates.spawn],
  ]);
  const map = attributes([
    ["name", snapshot.mapName],
    ["author", "CipSoft"],
  ]);
  return (
    '<?xml version="1.0"?>' +
    '<tsqp version="1.0">' +
    `<serverinfo ${serverinfo}/>` +
    `<owner ${owner}/>` +
    `<players ${players}/>` +
    `<monsters total="${snapshot.monsters}"/>` +
    `<npcs total="${snapshot.npcs}"/>` +
    `<rates ${rates}/>` +
    `<map ${map}/>` +
    `<motd>${escapeXml(config.motd)}</motd>` +
    "</tsqp>"
  );
}
