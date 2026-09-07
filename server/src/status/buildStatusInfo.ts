import {
  STATUS_CLIENT_VERSION,
  STATUS_SERVER_SOFTWARE,
  STATUS_SERVER_VERSION,
} from "./buildStatusXml";
import { STATUS_REQUEST } from "./parseStatusRequest";
import type { StatusConfig } from "./StatusConfig";
import type { StatusSnapshot } from "./StatusSnapshot";

/**
 * The binary (`0x01`) status reply, Canary's ProtocolStatus::sendInfo. Unlike
 * the XML form this one carries the usual `u16le` length header. The
 * per-player list (`extPlayersInfo`) and character lookup are deliberately
 * not answered: the public API already publishes the online list under its
 * own rate limits, and this unauthenticated raw socket should not.
 */
export function buildStatusInfo(
  config: StatusConfig,
  snapshot: StatusSnapshot,
  flags: number,
): Buffer {
  const parts: Buffer[] = [];
  const byte = (value: number) => parts.push(Buffer.from([value]));
  const string = (value: string) => {
    const bytes = Buffer.from(value, "latin1").subarray(0, 0xffff);
    const length = Buffer.alloc(2);
    length.writeUInt16LE(bytes.length);
    parts.push(length, bytes);
  };
  const uint32 = (value: number) => {
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32LE(Math.min(Math.max(value, 0), 0xffff_ffff));
    parts.push(bytes);
  };
  if (flags & STATUS_REQUEST.basicServerInfo) {
    byte(0x10);
    string(config.serverName);
    string(config.ip);
    string(String(config.port));
  }
  if (flags & STATUS_REQUEST.ownerServerInfo) {
    byte(0x11);
    string(config.ownerName);
    string(config.ownerEmail);
  }
  if (flags & STATUS_REQUEST.miscServerInfo) {
    byte(0x12);
    string(config.motd);
    string(config.location);
    string(config.url);
    const uptime = Buffer.alloc(8);
    uptime.writeBigUInt64LE(BigInt(Math.max(snapshot.uptimeSeconds, 0)));
    parts.push(uptime);
  }
  if (flags & STATUS_REQUEST.playersInfo) {
    byte(0x20);
    uint32(snapshot.playersOnline);
    uint32(snapshot.maxPlayers);
    uint32(snapshot.peakPlayers);
  }
  if (flags & STATUS_REQUEST.mapInfo) {
    byte(0x30);
    string(snapshot.mapName);
    string("CipSoft");
    parts.push(Buffer.alloc(4));
  }
  if (flags & STATUS_REQUEST.serverSoftwareInfo) {
    byte(0x23);
    string(STATUS_SERVER_SOFTWARE);
    string(STATUS_SERVER_VERSION);
    string(STATUS_CLIENT_VERSION);
  }
  const payload = Buffer.concat(parts);
  const header = Buffer.alloc(2);
  header.writeUInt16LE(payload.length);
  return Buffer.concat([header, payload]);
}
