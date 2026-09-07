/** Bit flags of the binary (`0x01`) status query, as in Canary's protocolstatus.hpp. */
export const STATUS_REQUEST = {
  basicServerInfo: 0x01,
  ownerServerInfo: 0x02,
  miscServerInfo: 0x04,
  playersInfo: 0x08,
  mapInfo: 0x10,
  extPlayersInfo: 0x20,
  playerStatusInfo: 0x40,
  serverSoftwareInfo: 0x80,
} as const;

/** The status protocol byte a client opens the connection with. */
export const STATUS_PROTOCOL_ID = 0xff;
/** `FF FF "info"` is 6 bytes; the binary form adds at most a 255-byte name. */
export const MAX_STATUS_REQUEST_BYTES = 2 + 4 + 2 + 255;

export type StatusRequest =
  | { readonly kind: "xml" }
  | {
      readonly kind: "info";
      readonly flags: number;
      readonly characterName: string;
    };

export type ParsedStatusRequest =
  | { readonly state: "incomplete" }
  | { readonly state: "invalid" }
  | { readonly state: "ok"; readonly request: StatusRequest };

/**
 * Decodes one length-framed OT packet: `u16le length`, `FF` (protocol id),
 * then either `FF "info"` (XML reply) or `01 u16le flags [u16le-len name]`.
 */
export function parseStatusRequest(buffer: Buffer): ParsedStatusRequest {
  if (buffer.length < 2) return { state: "incomplete" };
  const length = buffer.readUInt16LE(0);
  if (length < 2 || length > MAX_STATUS_REQUEST_BYTES - 2) {
    return { state: "invalid" };
  }
  if (buffer.length < 2 + length) return { state: "incomplete" };
  const body = buffer.subarray(2, 2 + length);
  if (body[0] !== STATUS_PROTOCOL_ID) return { state: "invalid" };
  if (body[1] === 0xff) {
    if (body.length !== 6 || body.toString("latin1", 2, 6) !== "info") {
      return { state: "invalid" };
    }
    return { state: "ok", request: { kind: "xml" } };
  }
  if (body[1] !== 0x01 || body.length < 4) return { state: "invalid" };
  const flags = body.readUInt16LE(2);
  if ((flags & STATUS_REQUEST.playerStatusInfo) === 0) {
    if (body.length !== 4) return { state: "invalid" };
    return { state: "ok", request: { kind: "info", flags, characterName: "" } };
  }
  if (body.length < 6) return { state: "invalid" };
  const nameLength = body.readUInt16LE(4);
  if (body.length !== 6 + nameLength) return { state: "invalid" };
  const characterName = body.toString("latin1", 6, 6 + nameLength);
  return { state: "ok", request: { kind: "info", flags, characterName } };
}
