import { describe, expect, it } from "vitest";
import { parseStatusRequest, STATUS_REQUEST } from "./parseStatusRequest";

const XML_QUERY = Buffer.from([0x06, 0x00, 0xff, 0xff, 0x69, 0x6e, 0x66, 0x6f]);

describe("parseStatusRequest", () => {
  it("decodes the otservlist XML query", () => {
    expect(parseStatusRequest(XML_QUERY)).toEqual({
      state: "ok",
      request: { kind: "xml" },
    });
  });

  it("waits for the header and body to arrive", () => {
    expect(parseStatusRequest(XML_QUERY.subarray(0, 1))).toEqual({
      state: "incomplete",
    });
    expect(parseStatusRequest(XML_QUERY.subarray(0, 5))).toEqual({
      state: "incomplete",
    });
  });

  it("decodes the binary query with flags and an optional name", () => {
    const flags = STATUS_REQUEST.basicServerInfo | STATUS_REQUEST.playersInfo;
    const plain = Buffer.from([0x04, 0x00, 0xff, 0x01, flags, 0x00]);
    expect(parseStatusRequest(plain)).toEqual({
      state: "ok",
      request: { kind: "info", flags, characterName: "" },
    });
    const withName = Buffer.from([
      0x09, 0x00, 0xff, 0x01, STATUS_REQUEST.playerStatusInfo, 0x00,
      0x03, 0x00, 0x42, 0x6f, 0x62,
    ]);
    expect(parseStatusRequest(withName)).toEqual({
      state: "ok",
      request: {
        kind: "info",
        flags: STATUS_REQUEST.playerStatusInfo,
        characterName: "Bob",
      },
    });
  });

  it("rejects anything that is not a status query", () => {
    const invalid = [
      Buffer.from([0x00, 0x00]),
      Buffer.from([0x06, 0x00, 0x0a, 0xff, 0x69, 0x6e, 0x66, 0x6f]),
      Buffer.from([0x06, 0x00, 0xff, 0xff, 0x69, 0x6e, 0x66, 0x78]),
      Buffer.from([0x05, 0x00, 0xff, 0xff, 0x69, 0x6e, 0x66]),
      Buffer.from([0x02, 0x00, 0xff, 0x07]),
      Buffer.from([0x05, 0x00, 0xff, 0x01, 0x01, 0x00, 0x00]),
      Buffer.from([0x06, 0x00, 0xff, 0x01, 0x40, 0x00, 0x09, 0x00]),
      Buffer.from("GET / HTTP/1.1\r\n\r\n"),
    ];
    for (const buffer of invalid) {
      expect(parseStatusRequest(buffer)).toEqual({ state: "invalid" });
    }
  });
});
